package io.karelisio.prisme.widget

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.view.View
import android.widget.RemoteViews
import io.karelisio.prisme.MainActivity
import io.karelisio.prisme.R
import io.karelisio.prisme.quick.QuickChanger

/** Dessin du widget d'accueil : aperçu du fond (ou fond neutre aux couleurs de Prisme) et bouton « Fond suivant ». */
internal object WidgetViews {
    private const val REQUEST_OPEN = 1
    private const val REQUEST_NEXT = 2

    /**
     * [thumbnail] doit rester petit : le bitmap voyage jusqu'au lanceur par un échange binder
     * (voir [WidgetThumbnail]).
     */
    fun build(context: Context, thumbnail: Bitmap?, button: WidgetButton): RemoteViews {
        val views = RemoteViews(context.packageName, R.layout.widget_prisme)
        if (thumbnail != null) views.setImageViewBitmap(R.id.widget_preview, thumbnail)
        views.setViewVisibility(R.id.widget_preview, if (thumbnail != null) View.VISIBLE else View.GONE)
        views.setViewVisibility(R.id.widget_placeholder, if (thumbnail != null) View.GONE else View.VISIBLE)

        // Toucher le widget, aperçu ou fond neutre (hors du bouton), ouvre l'app.
        views.setOnClickPendingIntent(android.R.id.background, openApp(context))

        views.setTextViewText(R.id.widget_next_label, label(context, button))
        // Une issue (« Aucun favori »…) prend toute la place du bouton.
        views.setViewVisibility(R.id.widget_next_icon, if (button is WidgetButton.Result) View.GONE else View.VISIBLE)
        views.setOnClickPendingIntent(R.id.widget_next, nextWallpaper(context))
        return views
    }

    private fun label(context: Context, button: WidgetButton): String = when (button) {
        WidgetButton.Idle -> context.getString(R.string.widget_next)
        WidgetButton.Changing -> context.getString(R.string.widget_changing)
        is WidgetButton.Result -> QuickChanger.tileLabel(context, button.outcome)
    }

    private fun openApp(context: Context): PendingIntent {
        val intent = Intent(context, MainActivity::class.java)
            .setAction(Intent.ACTION_MAIN)
            .addCategory(Intent.CATEGORY_LAUNCHER)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
        return PendingIntent.getActivity(context, REQUEST_OPEN, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    /** Diffusion explicite vers le widget lui-même : [PrismeWidgetProvider.onReceive] lance le changement. */
    private fun nextWallpaper(context: Context): PendingIntent {
        val intent = Intent(context, PrismeWidgetProvider::class.java).setAction(PrismeWidgetProvider.ACTION_NEXT)
        return PendingIntent.getBroadcast(context, REQUEST_NEXT, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
}
