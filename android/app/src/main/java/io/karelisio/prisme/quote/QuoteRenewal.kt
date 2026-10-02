package io.karelisio.prisme.quote

import android.content.Context
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import io.karelisio.prisme.automation.AutomationStore
import io.karelisio.prisme.automation.EveningDim
import io.karelisio.prisme.system.DailyNotifier
import io.karelisio.prisme.system.ErrorLog
import io.karelisio.prisme.wallpaper.CurrentWallpapers
import java.util.Calendar
import java.util.concurrent.TimeUnit

/**
 * Renouvellement de la phrase du jour : chaque matin à 6 h (heure locale), et dès que l'option ou ses
 * réglages changent, les fonds posés par Prisme (leurs copies d'origine) sont réappliqués avec la phrase du
 * jour, puis le voile du soir en cours. Rien n'est fait pour un fond jamais posé par Prisme.
 */
internal object QuoteRenewal {
    private const val WORK = "prisme-quote-daily"

    /** Heure locale du renouvellement. */
    const val RENEW_HOUR = 6

    /** Un seul renouvellement à la fois : un réglage reçu pendant la tâche du matin n'est jamais écrasé par elle. */
    private val lock = Any()

    /** La phrase du jour à poser maintenant ; null si l'option est coupée ou sans phrase. */
    fun today(context: Context, now: Calendar = Calendar.getInstance()): QuoteSpec? =
        QuoteSelector.today(QuoteStore(context).config(), now)

    /** Réglages reçus de l'app : enregistrés, renouvellement programmé, fonds réappliqués tout de suite si besoin. */
    fun configure(context: Context, raw: String) = synchronized(lock) {
        val config = QuoteConfig.parse(raw)
        val store = QuoteStore(context)
        val wasEnabled = store.enabled
        store.save(raw, config.enabled)
        schedule(context, config.enabled)
        // Option restée coupée (l'app envoie ses réglages à chaque lancement) : les fonds ne sont pas touchés.
        if (config.enabled || wasEnabled) renewLocked(context)
    }

    /** Réapplique les fonds Prisme actuels avec la phrase du jour et le voile en cours. */
    fun renew(context: Context) = synchronized(lock) { renewLocked(context) }

    private fun renewLocked(context: Context) {
        val wallpapers = CurrentWallpapers(context)
        wallpapers.refresh(EveningDim.current(context), today(context))
        // Option coupée : plus de phrase, et plus besoin des copies si « Assombrir le soir » est coupé aussi.
        if (!QuoteStore(context).enabled) wallpapers.dropIfUnused(dimEnabled = AutomationStore(context).config().dim.enabled)
    }

    private fun schedule(context: Context, enabled: Boolean) {
        if (enabled) scheduleNext(context) else WorkManager.getInstance(context).cancelUniqueWork(WORK)
    }

    /** Tâche ponctuelle au prochain 6 h, reprogrammée chaque jour (comme la notification « Fond du jour »). */
    fun scheduleNext(context: Context, now: Calendar = Calendar.getInstance()) {
        if (!QuoteStore(context).enabled) return
        val request = OneTimeWorkRequestBuilder<QuoteWorker>()
            .setInitialDelay(DailyNotifier.millisUntil(RENEW_HOUR, now), TimeUnit.MILLISECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(WORK, ExistingWorkPolicy.REPLACE, request)
    }
}

/** Renouvellement du matin, exécuté par WorkManager même app fermée. */
class QuoteWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result {
        try {
            QuoteRenewal.renew(applicationContext)
        } catch (e: Exception) {
            ErrorLog.record(applicationContext, "Citation du jour", e)
        } catch (e: OutOfMemoryError) {
            ErrorLog.record(applicationContext, "Citation du jour", e)
        }
        // Quoi qu'il arrive, le lendemain est programmé : un échec ne doit pas interrompre la suite.
        QuoteRenewal.scheduleNext(applicationContext)
        return Result.success()
    }
}
