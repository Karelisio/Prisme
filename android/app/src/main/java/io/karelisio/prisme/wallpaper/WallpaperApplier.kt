package io.karelisio.prisme.wallpaper

import android.app.WallpaperManager
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import androidx.core.content.edit
import androidx.core.graphics.ColorUtils
import io.karelisio.prisme.automation.AutomationStore
import io.karelisio.prisme.automation.EveningDim
import io.karelisio.prisme.widget.WidgetUpdater
import java.io.File
import java.io.IOException

/** Applique une image (déjà locale) via WallpaperManager, recadrée et à la taille exacte de l'écran. */
internal class WallpaperApplier(private val context: Context) {

    fun apply(file: File, target: WallpaperTarget, crop: NormalizedRect?, screen: ScreenInfo.Size) {
        val manager = WallpaperManager.getInstance(context)
        if (!manager.isWallpaperSupported || !manager.isSetWallpaperAllowed) {
            throw WallpaperException("NOT_ALLOWED", "Cet appareil n'autorise pas le changement de fond d'écran")
        }
        val bounds = BitmapLoader.readBounds(file)
        val region = CropMath.resolveCrop(bounds.width, bounds.height, crop, screen.width, screen.height)
        val bitmap = BitmapLoader.decodeRegion(file, region, screen.width, screen.height)
        try {
            // « Assombrir le soir » : on garde l'image d'origine pour suivre les paliers suivants.
            val dimConfig = AutomationStore(context).config().dim
            val current = CurrentWallpapers(context)
            if (dimConfig.enabled) current.save(bitmap, target) else current.clear()
            val level = EveningDim.current(context)
            setDimmed(manager, bitmap, level, target)
            current.recordLevel(target, level)
            // Aperçu du widget d'accueil (jamais bloquant : ses erreurs vont dans le journal).
            WidgetUpdater(context).onWallpaperApplied(bitmap, target)
        } finally {
            bitmap.recycle()
        }
    }

    companion object {
        fun setBitmap(manager: WallpaperManager, bitmap: Bitmap, target: WallpaperTarget) {
            try {
                manager.setBitmap(bitmap, null, true, target.flags)
            } catch (e: SecurityException) {
                throw WallpaperException("NOT_ALLOWED", "Changement de fond d'écran refusé par le système", e)
            } catch (e: IOException) {
                throw WallpaperException("APPLY_FAILED", "Le système n'a pas pu appliquer le fond d'écran", e)
            }
        }

        /** Applique [bitmap] recouvert d'un voile noir d'opacité [level] (tel quel à 0). */
        fun setDimmed(manager: WallpaperManager, bitmap: Bitmap, level: Float, target: WallpaperTarget) {
            if (level <= 0f) {
                setBitmap(manager, bitmap, target)
                return
            }
            val copy = bitmap.copy(Bitmap.Config.ARGB_8888, true)
            try {
                Canvas(copy).drawColor(ColorUtils.setAlphaComponent(Color.BLACK, (level.coerceIn(0f, 1f) * 255).toInt()))
                setBitmap(manager, copy, target)
            } finally {
                copy.recycle()
            }
        }
    }
}

/**
 * Fonds posés par Prisme (images d'origine à la taille de l'écran) pour l'assombrissement du soir :
 * quand le palier change, ils sont réappliqués plus ou moins sombres.
 */
internal class CurrentWallpapers(private val context: Context) {
    private val dir = File(context.filesDir, "current")
    private val prefs = context.getSharedPreferences("prisme_current", Context.MODE_PRIVATE)

    fun save(bitmap: Bitmap, target: WallpaperTarget) {
        dir.mkdirs()
        val files = files(target)
        files.firstOrNull()?.let { first ->
            first.outputStream().use { bitmap.compress(Bitmap.CompressFormat.JPEG, 92, it) }
            files.drop(1).forEach { first.copyTo(it, overwrite = true) }
        }
    }

    fun clear() {
        if (dir.exists()) dir.deleteRecursively()
        prefs.edit { clear() }
    }

    fun recordLevel(target: WallpaperTarget, level: Float) = prefs.edit {
        if (target != WallpaperTarget.LOCK) putFloat(KEY_HOME, level)
        if (target != WallpaperTarget.HOME) putFloat(KEY_LOCK, level)
    }

    /** Réapplique les fonds Prisme au palier [level] s'il a changé (rien si un fond animé est actif). */
    fun refreshDim(level: Float) {
        val manager = WallpaperManager.getInstance(context)
        if (manager.wallpaperInfo != null) return
        val home = File(dir, "home.jpg").takeIf { it.isFile && prefs.getFloat(KEY_HOME, 0f) != level }
        val lock = File(dir, "lock.jpg").takeIf { it.isFile && prefs.getFloat(KEY_LOCK, 0f) != level }
        // Même image sur les deux écrans : une seule application.
        val jobs = if (home != null && lock != null && home.readBytes().contentEquals(lock.readBytes())) {
            listOf(home to WallpaperTarget.BOTH)
        } else {
            listOfNotNull(home?.to(WallpaperTarget.HOME), lock?.to(WallpaperTarget.LOCK))
        }
        for ((file, target) in jobs) {
            val original = BitmapFactory.decodeFile(file.path) ?: continue
            try {
                WallpaperApplier.setDimmed(manager, original, level, target)
                recordLevel(target, level)
            } finally {
                original.recycle()
            }
        }
    }

    private fun files(target: WallpaperTarget): List<File> = listOfNotNull(
        File(dir, "home.jpg").takeIf { target != WallpaperTarget.LOCK },
        File(dir, "lock.jpg").takeIf { target != WallpaperTarget.HOME },
    )

    private companion object {
        const val KEY_HOME = "home"
        const val KEY_LOCK = "lock"
    }
}
