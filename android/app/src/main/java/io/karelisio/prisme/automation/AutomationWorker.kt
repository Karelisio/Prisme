package io.karelisio.prisme.automation

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import io.karelisio.prisme.system.ErrorLog
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Automatismes exécutés par WorkManager, y compris app fermée (voir [AutomationRunner]). */
class AutomationWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        try {
            val outcome = AutomationRunner.run(
                applicationContext,
                prefetch = inputData.getBoolean(KEY_PREFETCH, false),
                force = inputData.getBoolean(KEY_FORCE, false),
            )
            when {
                outcome == AutomationRunner.Outcome.DONE -> Result.success()
                runAttemptCount < MAX_ATTEMPTS -> Result.retry()
                else -> Result.success()
            }
        } catch (e: Exception) {
            // Erreur imprévue : gardée dans le journal visible dans Diagnostic.
            ErrorLog.record(applicationContext, "Automatisme", e)
            Result.failure()
        }
    }

    companion object {
        const val KEY_PREFETCH = "prefetch"
        const val KEY_FORCE = "force"
        private const val MAX_ATTEMPTS = 3
    }
}
