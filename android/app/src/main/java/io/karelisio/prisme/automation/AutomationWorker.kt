package io.karelisio.prisme.automation

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import io.karelisio.prisme.system.ErrorLog
import io.karelisio.prisme.wallpaper.AppliedWallpapers
import io.karelisio.prisme.wallpaper.ScreenInfo
import io.karelisio.prisme.wallpaper.WallpaperApplier
import io.karelisio.prisme.wallpaper.WallpaperException
import io.karelisio.prisme.wallpaper.WallpaperRef
import io.karelisio.prisme.wallpaper.WallpaperTarget
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

/**
 * Exécution des automatismes (rotation, fonds dynamiques, mode focus), y compris app fermée.
 * N'applique un fond que s'il diffère de celui déjà posé par Prisme, pour ménager la batterie.
 */
class AutomationWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        try {
            evaluate()
        } catch (e: Exception) {
            // Erreur imprévue : gardée dans le journal visible dans Diagnostic.
            ErrorLog.record(applicationContext, "Automatisme", e)
            Result.failure()
        }
    }

    private fun evaluate(): Result {
        val store = AutomationStore(applicationContext)
        val config = store.config()
        if (!config.anyEnabled) return Result.success()

        val files = AutomationFiles(applicationContext)
        if (inputData.getBoolean(KEY_PREFETCH, false)) files.prefetch(config)

        val moment = AutomationStore.now()
        val battery = BatteryReader.read(applicationContext)
        val env = Environment(moment, battery?.level, battery?.charging == true, weather(store, config, moment.epochMillis))
        val stored = store.state()
        val previous = if (inputData.getBoolean(KEY_FORCE, false)) stored.copy(appliedHome = null, appliedLock = null) else stored
        val decision = RulesEngine.decide(config, env, previous, AppliedWallpapers(applicationContext)::lastManual)

        val result = try {
            store.saveState(apply(decision, files, store))
            Result.success()
        } catch (e: WallpaperException) {
            // Image pas encore téléchargée ou réseau absent : on réessaie un peu plus tard.
            store.saveState(decision.state.copy(appliedHome = previous.appliedHome, appliedLock = previous.appliedLock))
            if (runAttemptCount < MAX_ATTEMPTS) Result.retry() else Result.success()
        }
        AutomationScheduler.scheduleNext(applicationContext, config, store.state(), moment)
        return result
    }

    private fun weather(store: AutomationStore, config: AutomationConfig, now: Long): WeatherCondition? {
        val mode = config.dynamic.mode as? DynamicMode.Weather ?: return null
        if (!config.dynamic.enabled) return null
        store.cachedWeather(mode.latitude, mode.longitude, now)?.let { return it }
        return runCatching { WeatherClient.current(mode.latitude, mode.longitude) }
            .onSuccess { store.saveWeather(mode.latitude, mode.longitude, it, now) }
            .getOrNull()
    }

    private fun apply(decision: Decision, files: AutomationFiles, store: AutomationStore): AutomationState {
        var state = decision.state
        val home = decision.home?.takeIf { it.id != state.appliedHome }
        val lock = decision.lock?.takeIf { it.id != state.appliedLock }
        if (home == null && lock == null) return state

        val screen = ScreenInfo.read(applicationContext, null)
        val applier = WallpaperApplier(applicationContext)
        val log = mutableListOf<JSONObject>()
        fun applyRef(ref: WallpaperRef, target: WallpaperTarget) {
            applier.apply(files.resolve(ref), target, ref.crop, screen)
            log += JSONObject()
                .put("id", ref.id)
                .put("target", target.key)
                .put("at", System.currentTimeMillis())
                .put("reason", decision.reason.name.lowercase())
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
        return state
    }

    companion object {
        const val KEY_PREFETCH = "prefetch"
        const val KEY_FORCE = "force"
        private const val MAX_ATTEMPTS = 3
    }
}
