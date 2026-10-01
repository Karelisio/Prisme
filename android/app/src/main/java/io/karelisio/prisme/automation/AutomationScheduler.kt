package io.karelisio.prisme.automation

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import java.util.concurrent.TimeUnit

/**
 * Planification WorkManager : une tâche périodique (contrôle régulier : batterie, météo, rotation)
 * et une tâche ponctuelle calée sur le prochain changement prévu (début de focus, créneau horaire…).
 */
object AutomationScheduler {
    private const val PERIODIC = "prisme-automation-periodic"
    private const val NEXT = "prisme-automation-next"
    private const val NOW = "prisme-automation-now"
    private const val MIN_PERIOD_MINUTES = 15L

    fun configure(context: Context, config: AutomationConfig, force: Boolean) {
        val work = WorkManager.getInstance(context)
        if (!config.anyEnabled) {
            work.cancelUniqueWork(PERIODIC)
            work.cancelUniqueWork(NEXT)
            work.cancelUniqueWork(NOW)
            return
        }
        // Rotation seule : la période suit l'intervalle choisi ; sinon contrôle toutes les 15 min.
        val onlyRotation = !config.dynamic.enabled && !config.focus.enabled
        val period = if (onlyRotation) maxOf(MIN_PERIOD_MINUTES, config.rotation.intervalMinutes.toLong()) else MIN_PERIOD_MINUTES
        val periodic = PeriodicWorkRequestBuilder<AutomationWorker>(period, TimeUnit.MINUTES)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 1, TimeUnit.MINUTES)
            .build()
        work.enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.UPDATE, periodic)
        runNow(context, prefetch = true, force = force)
    }

    /** [force] : réapplique même si Prisme pense que le bon fond est déjà en place. */
    fun runNow(context: Context, prefetch: Boolean = false, force: Boolean = false) {
        val request = OneTimeWorkRequestBuilder<AutomationWorker>()
            .setInputData(workDataOf(AutomationWorker.KEY_PREFETCH to prefetch, AutomationWorker.KEY_FORCE to force))
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        // À la suite de l'exécution en cours plutôt qu'à sa place : une demande forcée n'est jamais perdue.
        WorkManager.getInstance(context).enqueueUniqueWork(NOW, ExistingWorkPolicy.APPEND_OR_REPLACE, request)
    }

    fun scheduleNext(context: Context, config: AutomationConfig, state: AutomationState, moment: Moment) {
        val work = WorkManager.getInstance(context)
        val minutes = RulesEngine.minutesUntilNextChange(config, state, moment)
        if (minutes == null) {
            work.cancelUniqueWork(NEXT)
            return
        }
        // Quelques secondes de marge pour tomber juste après la limite.
        val delaySeconds = minutes * 60L - (moment.epochMillis / 1000L % 60L) + 5L
        val request = OneTimeWorkRequestBuilder<AutomationWorker>()
            .setInitialDelay(delaySeconds.coerceAtLeast(5L), TimeUnit.SECONDS)
            .build()
        work.enqueueUniqueWork(NEXT, ExistingWorkPolicy.REPLACE, request)
    }
}
