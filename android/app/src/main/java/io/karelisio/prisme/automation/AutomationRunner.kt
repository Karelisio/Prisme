package io.karelisio.prisme.automation

import android.content.Context
import io.karelisio.prisme.wallpaper.AppliedWallpapers
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
        val env = Environment(moment, battery?.level, battery?.charging == true, weather(store, config, moment.epochMillis))
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

    /** Nouveau fond en ligne (rotation « au hasard »), sauf sur connexion limitée avec « Wi-Fi seulement ». */
    private fun pickOnline(context: Context, config: AutomationConfig): OnlinePick {
        val online = config.rotation.online ?: return OnlinePick.Failed
        if (online.wifiOnly && OnlineQueue.metered(context)) return OnlinePick.Later
        val size = ScreenInfo.read(context, null)
        val screen = OnlineSources.Screen(size.width, size.height)
        val random = Random.Default
        val candidate = OnlineQueue(context).next(online, random) { OnlineSources.fetch(it, random, screen) }
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
        val online = state.onlineRef?.let { OnlineQueue(context).current(it.id) }
        fun applyRef(ref: WallpaperRef, target: WallpaperTarget) {
            applier.apply(files.resolve(ref), target, ref.crop, screen)
            log += JSONObject()
                .put("id", ref.id)
                .put("target", target.key)
                .put("at", System.currentTimeMillis())
                .put("reason", decision.reason.name.lowercase())
                // Fond trouvé en ligne : l'app l'ajoute à l'historique avec sa description complète.
                .apply { if (online != null && online.id == ref.id) put("wallpaper", online.toWallpaperJson()) }
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
        val onlineConfig = config.rotation.online
        if (online != null && onlineConfig != null && (home?.id == online.id || lock?.id == online.id)) {
            OnlineSources.trackDownload(online, onlineConfig)
            // Les fonds en ligne précédents ne servent plus : seule l'image actuelle est gardée.
            files.cleanup(config, state.onlineRef)
        }
        return state
    }
}
