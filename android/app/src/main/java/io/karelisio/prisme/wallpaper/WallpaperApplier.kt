package io.karelisio.prisme.wallpaper

import android.app.WallpaperManager
import android.content.Context
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
            manager.setBitmap(bitmap, null, true, target.flags)
        } catch (e: SecurityException) {
            throw WallpaperException("NOT_ALLOWED", "Changement de fond d'écran refusé par le système", e)
        } catch (e: IOException) {
            throw WallpaperException("APPLY_FAILED", "Le système n'a pas pu appliquer le fond d'écran", e)
        } finally {
            bitmap.recycle()
        }
    }
}
