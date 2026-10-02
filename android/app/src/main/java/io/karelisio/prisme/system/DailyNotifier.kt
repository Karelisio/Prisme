package io.karelisio.prisme.system

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.content.edit
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import io.karelisio.prisme.MainActivity
import io.karelisio.prisme.R
import java.util.Calendar
import java.util.Locale
import java.util.concurrent.TimeUnit

/**
 * Notification quotidienne « Fond du jour » : une tâche WorkManager ponctuelle, reprogrammée
 * pour le lendemain à chaque passage (pas de dérive comme avec une tâche périodique).
 */
object DailyNotifier {
    private const val WORK = "prisme-daily-notification"
    private const val PREFS = "prisme_daily"
    private const val KEY_ENABLED = "enabled"
    private const val KEY_HOUR = "hour"
    private const val KEY_LAST_DAY = "lastDay"
    private const val CHANNEL = "daily"
    private const val NOTIFICATION_ID = 4201

    fun configure(context: Context, enabled: Boolean, hour: Int) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit {
            putBoolean(KEY_ENABLED, enabled)
            putInt(KEY_HOUR, hour)
        }
        if (enabled) scheduleNext(context) else WorkManager.getInstance(context).cancelUniqueWork(WORK)
    }

    fun scheduleNext(context: Context, now: Calendar = Calendar.getInstance()) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (!prefs.getBoolean(KEY_ENABLED, false)) return
        val request = OneTimeWorkRequestBuilder<DailyWorker>()
            .setInitialDelay(millisUntil(prefs.getInt(KEY_HOUR, 9), now), TimeUnit.MILLISECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(WORK, ExistingWorkPolicy.REPLACE, request)
    }

    /** Délai jusqu'au prochain passage à `hour` h pile (demain si l'heure est passée). */
    fun millisUntil(hour: Int, now: Calendar): Long {
        val next = (now.clone() as Calendar).apply {
            set(Calendar.HOUR_OF_DAY, hour.coerceIn(0, 23))
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        // Le jour suivant à la même heure locale, changement d'heure compris.
        if (!next.after(now)) next.add(Calendar.DAY_OF_MONTH, 1)
        return next.timeInMillis - now.timeInMillis
    }

    fun dayKey(calendar: Calendar): String = String.format(
        Locale.ROOT,
        "%04d-%02d-%02d",
        calendar.get(Calendar.YEAR),
        calendar.get(Calendar.MONTH) + 1,
        calendar.get(Calendar.DAY_OF_MONTH),
    )

    fun notificationsAllowed(context: Context): Boolean {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return false
        }
        return NotificationManagerCompat.from(context).areNotificationsEnabled()
    }

    /** Affiche la notification (une fois par jour au plus) ; touchée, elle ouvre le fond du jour. */
    internal fun notifyToday(context: Context, now: Calendar = Calendar.getInstance()) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val today = dayKey(now)
        if (!prefs.getBoolean(KEY_ENABLED, false) || prefs.getString(KEY_LAST_DAY, null) == today) return
        if (!notificationsAllowed(context)) return
        ensureChannel(context)
        val intent = Intent(context, MainActivity::class.java)
            .setAction(AppActions.PREFIX + "DAILY")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val pending = PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val notification = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(context.getString(R.string.daily_title))
            .setContentText(context.getString(R.string.daily_text))
            .setContentIntent(pending)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_RECOMMENDATION)
            .build()
        try {
            NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
            prefs.edit { putString(KEY_LAST_DAY, today) }
        } catch (e: SecurityException) {
            ErrorLog.record(context, "Fond du jour", e)
        }
    }

    private fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < 26) return
        val channel = NotificationChannel(CHANNEL, context.getString(R.string.daily_channel), NotificationManager.IMPORTANCE_DEFAULT)
            .apply { description = context.getString(R.string.daily_channel_description) }
        context.getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
    }
}

class DailyWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result {
        try {
            DailyNotifier.notifyToday(applicationContext)
        } catch (e: Exception) {
            ErrorLog.record(applicationContext, "Fond du jour", e)
        }
        DailyNotifier.scheduleNext(applicationContext)
        return Result.success()
    }
}
