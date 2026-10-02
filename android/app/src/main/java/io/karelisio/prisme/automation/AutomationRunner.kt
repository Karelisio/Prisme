package io.karelisio.prisme.automation

import android.content.Context
import android.content.res.Configuration
import io.karelisio.prisme.system.ErrorLog
import io.karelisio.prisme.wallpaper.AppliedWallpapers
import io.karelisio.prisme.wallpaper.CurrentWallpapers
import io.karelisio.prisme.wallpaper.ScreenInfo
import io.karelisio.prisme.wallpaper.WallpaperApplier
import io.karelisio.prisme.wallpaper.WallpaperException
import io.karelisio.prisme.wallpaper.WallpaperRef
import io.karelisio.prisme.wallpaper.WallpaperTarget
import org.json.JSONObject
import kotlin.random.Random

/**
 * Évaluation des automatismes (rotation, fonds dynamiques, mode focus) et application du fond
 * choisi. Appelée par la tâche WorkManager et, tout de suite, par « Fond suivant » (tuile,
 * raccourci). N'applique un fond que s'il diffère de celui déjà posé par Prisme.
 */
internal object AutomationRunner {
    enum class Outcome {
        /** Rien à faire, ou fond appliqué. */
        DONE,

        /** Image pas encore téléchargée ou réseau absent : à réessayer plus tard. */
        RETRY,
    }

    private val lock = Any()

    fun run(context: Context, prefetch: Boolean, force: Boolean): Outcome = synchronized(lock) {
        val store = AutomationStore(context)
        val config = store.config()
        if (!config.anyEnabled) return Outcome.DONE

        val files = AutomationFiles(context)
        if (prefetch) files.prefetch(config)

        val moment = AutomationStore.now()
        val battery = BatteryReader.read(context)
        val env = Environment(moment, battery?.level, battery?.charging == true, weather(store, config, moment.epochMillis), darkMode(context))
        val stored = store.state()
        val previous = if (force) stored.copy(appliedHome = null, appliedLock = null) else stored
        val decision = RulesEngine.decide(
            config,
            env,
            previous,
            AppliedWallpapers(context)::lastManual,
            nextOnline = { pickOnline(context, config) },
            overrides = Overrides.compute(context, config, moment),
        )

        val outcome = try {
            store.saveState(apply(context, decision, files, store, config).copy(lastRunAt = moment.epochMillis))
            if (decision.retry) Outcome.RETRY else Outcome.DONE
        } catch (e: WallpaperException) {
            store.saveState(
                decision.state.copy(appliedHome = previous.appliedHome, appliedLock = previous.appliedLock, lastRunAt = moment.epochMillis),
            )
            Outcome.RETRY
        }
        // Assombrissement du soir : les fonds en place suivent le palier du moment.
        runCatching { CurrentWallpapers(context).refreshDim(EveningDim.level(config.dim, moment)) }
            .onFailure { ErrorLog.record(context, "Assombrir le soir", it) }
        AutomationScheduler.scheduleNext(context, config, store.state(), moment)
        outcome
    }

    private fun weather(store: AutomationStore, config: AutomationConfig, now: Long): WeatherCondition? {
        val mode = config.dynamic.mode as? DynamicMode.Weather ?: return null
        if (!config.dynamic.enabled) return null
        store.cachedWeather(mode.latitude, mode.longitude, now)?.let { return it }
        return runCatching { WeatherClient.current(mode.latitude, mode.longitude) }
            .onSuccess { store.saveWeather(mode.latitude, mode.longitude, it, now) }
            .getOrNull()
    }

    /** Mode sombre du système en cours. */
    fun darkMode(context: Context): Boolean =
        (context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES

    /** Nouveau fond en ligne (rotation « au hasard »), sauf sur connexion limitée avec « Wi-Fi seulement ». */
    private fun pickOnline(context: Context, config: AutomationConfig): OnlinePick {
        val online = config.rotation.online ?: return OnlinePick.Failed
        if (online.wifiOnly && OnlineQueue.metered(context)) return OnlinePick.Later
        val size = ScreenInfo.read(context, null)
        val screen = OnlineSources.Screen(size.width, size.height)
        val random = Random.Default
        val moment = AutomationStore.now()
        val night = config.rotation.smart && SunTimes.isNight(config.sunPoint()?.let { SunTimes.compute(it, moment) }, moment.minuteOfDay)
        val candidate = OnlineQueue(context).next(online, random, { OnlineSources.fetch(it, random, screen) }, preferDark = night)
        return candidate?.let { OnlinePick.Ready(it.ref()) } ?: OnlinePick.Failed
    }

    private fun apply(context: Context, decision: Decision, files: AutomationFiles, store: AutomationStore, config: AutomationConfig): AutomationState {
        var state = decision.state
        val home = decision.home?.takeIf { it.id != state.appliedHome }
        val lock = decision.lock?.takeIf { it.id != state.appliedLock }
        if (home == null && lock == null) return state

        val screen = ScreenInfo.read(context, null)
        val applier = WallpaperApplier(context)
        val log = mutableListOf<JSONObject>()
        val catalog = OnlineCatalog(context)
        val found = mutableListOf<OnlineCandidate>()
        fun applyRef(ref: WallpaperRef, target: WallpaperTarget) {
            applier.apply(files.resolve(ref), target, ref.crop, screen)
            val online = catalog.find(ref.id)?.takeIf { it.applyUrl == ref.uri }
            online?.let(found::add)
            log += JSONObject()
                .put("id", ref.id)
                .put("target", target.key)
                .put("at", System.currentTimeMillis())
                .put("reason", decision.reason.name.lowercase())
                // Fond trouvé en ligne : l'app l'ajoute à l'historique avec sa description complète.
                .apply { online?.let { put("wallpaper", it.toWallpaperJson()) } }
        }

        if (home != null && lock != null && home.id == lock.id) {
            applyRef(home, WallpaperTarget.BOTH)
            state = state.copy(appliedHome = home.id, appliedLock = lock.id)
        } else {
            home?.let {
                applyRef(it, WallpaperTarget.HOME)
                state = state.copy(appliedHome = it.id)
            }
            lock?.let {
                applyRef(it, WallpaperTarget.LOCK)
                state = state.copy(appliedLock = it.id)
            }
        }
        store.appendLog(log)
        if (found.isNotEmpty()) {
            val queries = config.onlineQueries()
            found.distinctBy { it.id }.forEach { OnlineSources.trackDownload(it, queries) }
            // Les fonds en ligne précédents ne servent plus : seules les images actuelles sont gardées.
            files.cleanup(config, keptOnline(context, state))
        }
        return state
    }

    /** Images en ligne à conserver : fond de la rotation en cours et fond de la fête du jour. */
    fun keptOnline(context: Context, state: AutomationState): List<WallpaperRef> =
        listOfNotNull(state.onlineRef, EventsRule.cachedRef(context, AutomationStore.now()))
}
