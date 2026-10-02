package io.karelisio.prisme.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import io.karelisio.prisme.quick.QuickActions
import io.karelisio.prisme.system.ErrorLog
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Widget d'écran d'accueil : aperçu du fond actuel (toucher ouvre l'app) et bouton « Fond suivant ».
 * L'aperçu est mis à jour par [WidgetUpdater] à chaque fond posé sur l'accueil ; aucune mise à jour
 * périodique (`updatePeriodMillis` à 0).
 */
class PrismeWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        WidgetUpdater(context).render(appWidgetManager, appWidgetIds)
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == ACTION_NEXT) nextWallpaper(context) else super.onReceive(context, intent)
    }

    /**
     * Même changement que la tuile des Réglages rapides (rotation, réserve de favoris, pochette de la
     * musique) ; QuickActions affiche déjà le toast d'issue. Le récepteur reste ouvert jusqu'à la fin du
     * changement pour que le processus ne soit pas arrêté en route.
     */
    private fun nextWallpaper(context: Context) {
        val pending = goAsync()
        val closed = AtomicBoolean(false)
        fun close() {
            if (closed.compareAndSet(false, true)) runCatching { pending?.finish() }
        }

        val updater = WidgetUpdater(context)
        val started = try {
            QuickActions.start(context, QuickActions.MODE_NEXT) { outcome ->
                updater.onChangeDone(outcome)
                close()
            }
        } catch (e: Exception) {
            runCatching { ErrorLog.record(context, "Widget d'accueil", e) }
            false
        }
        if (!started) {
            // Un changement est déjà en cours (tuile, raccourci…) : son toast suffit.
            close()
            return
        }
        updater.onChangeStarted()
        // Le système ne laisse pas un récepteur ouvert au-delà de quelques secondes ; le changement continue sans lui.
        Handler(Looper.getMainLooper()).postDelayed({ close() }, MAX_HOLD_MS)
    }

    companion object {
        /** Action de la diffusion envoyée par le bouton « Fond suivant ». */
        const val ACTION_NEXT = "io.karelisio.prisme.widget.action.NEXT"

        private const val MAX_HOLD_MS = 8_000L
    }
}
