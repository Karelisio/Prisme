package io.karelisio.prisme.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Handler
import android.os.Looper
import androidx.core.graphics.scale
import io.karelisio.prisme.quick.QuickChanger
import io.karelisio.prisme.system.ErrorLog
import io.karelisio.prisme.wallpaper.WallpaperTarget
import java.io.File

/**
 * Widget d'accueil : garde une petite copie du dernier fond posé sur l'accueil et redessine les widgets.
 *
 * Appelé après chaque application réussie d'un fond (voir WallpaperApplier) et par le widget lui-même.
 * Rien ici ne doit jamais faire échouer l'application d'un fond ni planter l'app : toute erreur part
 * dans le journal (Réglages › Diagnostic).
 */
internal class WidgetUpdater(context: Context) {
    private val context = context.applicationContext

    /** Enregistre la miniature de [bitmap] (le fond qui vient d'être posé) puis redessine les widgets. */
    fun onWallpaperApplied(bitmap: Bitmap, target: WallpaperTarget) {
        if (!WidgetThumbnail.appliesTo(target)) return
        safely {
            synchronized(LOCK) {
                saveThumbnail(bitmap)
                redrawAll()
            }
        }
    }

    /** Dessine [ids] à la demande du système (widget ajouté, appareil redémarré, appli mise à jour…). */
    fun render(manager: AppWidgetManager, ids: IntArray) = safely { redraw(manager, ids) }

    /** Le bouton du widget vient d'être touché et un changement démarre : « Changement… » jusqu'à son issue. */
    fun onChangeStarted() = safely {
        state.begin()
        redrawAll()
    }

    /**
     * Fin du changement lancé par le widget (fil principal). L'aperçu est déjà à jour si un fond a été posé ;
     * sinon le bouton annonce brièvement l'issue, puis redevient « Fond suivant ».
     */
    fun onChangeDone(outcome: QuickChanger.Outcome) = safely {
        val token = state.finish(outcome)
        redrawAll()
        if (token != null) {
            Handler(Looper.getMainLooper()).postDelayed({ safely { if (state.expire(token)) redrawAll() } }, RESULT_VISIBLE_MS)
        }
    }

    private fun redrawAll() {
        val manager = AppWidgetManager.getInstance(context)
        val ids = manager.getAppWidgetIds(ComponentName(context, PrismeWidgetProvider::class.java))
        if (ids.isNotEmpty()) redraw(manager, ids)
    }

    private fun redraw(manager: AppWidgetManager, ids: IntArray) {
        // Un seul dessin à la fois : le dernier lit toujours l'état le plus récent.
        synchronized(LOCK) {
            val thumbnail = loadThumbnail()
            try {
                manager.updateAppWidget(ids, WidgetViews.build(context, thumbnail, state.button))
            } finally {
                thumbnail?.recycle()
            }
        }
    }

    /** Copie réduite au format de l'écran, écrite à côté puis renommée : un lecteur ne voit jamais un fichier à moitié écrit. */
    private fun saveThumbnail(source: Bitmap) {
        val size = WidgetThumbnail.sizeFor(source.width, source.height)
        val file = WidgetThumbnail.file(context.filesDir)
        file.parentFile?.mkdirs()
        val temp = File(file.parentFile, "${file.name}.tmp")
        val thumbnail = source.scale(size.width, size.height)
        try {
            temp.outputStream().use { out ->
                check(thumbnail.compress(Bitmap.CompressFormat.JPEG, WidgetThumbnail.JPEG_QUALITY, out)) { "Miniature non encodée" }
            }
            if (!temp.renameTo(file)) temp.copyTo(file, overwrite = true)
        } finally {
            temp.delete()
            if (thumbnail !== source) thumbnail.recycle()
        }
    }

    /** Miniature relue en RGB_565 (2 octets par pixel), sous la limite des échanges avec le lanceur ; null s'il n'y en a pas. */
    private fun loadThumbnail(): Bitmap? {
        val file = WidgetThumbnail.file(context.filesDir)
        if (!file.isFile) return null
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.path, bounds)
        val options = BitmapFactory.Options().apply {
            inPreferredConfig = Bitmap.Config.RGB_565
            inSampleSize = WidgetThumbnail.sampleSizeFor(bounds.outWidth, bounds.outHeight)
        }
        return BitmapFactory.decodeFile(file.path, options)
    }

    private fun safely(block: () -> Unit) {
        try {
            block()
        } catch (e: Exception) {
            report(e)
        } catch (e: OutOfMemoryError) {
            report(e)
        }
    }

    private fun report(error: Throwable) {
        // Écrire le journal peut lui-même échouer (disque plein) : jamais d'erreur en plus.
        runCatching { ErrorLog.record(context, "Widget d'accueil", error) }
    }

    private companion object {
        val LOCK = Any()
        val state = WidgetState()

        /** Durée d'affichage du libellé d'une issue (« Aucun favori »…) avant de revenir à « Fond suivant ». */
        const val RESULT_VISIBLE_MS = 4_000L
    }
}
