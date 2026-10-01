package io.karelisio.prisme.wallpaper

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapRegionDecoder
import android.graphics.Rect
import android.os.Build
import java.io.File

/** Décodage économe en mémoire : seule la zone utile est lue, sous-échantillonnée si possible. */
internal object BitmapLoader {
    data class Bounds(val width: Int, val height: Int)

    fun readBounds(file: File): Bounds {
        val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.absolutePath, opts)
        if (opts.outWidth <= 0 || opts.outHeight <= 0) {
            throw WallpaperException("DECODE_FAILED", "Format d'image non pris en charge")
        }
        return Bounds(opts.outWidth, opts.outHeight)
    }

    /** Décode [region] puis la redimensionne exactement en [outWidth]×[outHeight]. */
    fun decodeRegion(file: File, region: PixelRect, outWidth: Int, outHeight: Int): Bitmap {
        val sample = CropMath.sampleSize(region.width, region.height, outWidth, outHeight)
        val rect = Rect(region.left, region.top, region.right, region.bottom)
        val decoded = try {
            decodeWithRegionDecoder(file, rect, sample) ?: decodeFallback(file, rect, sample)
        } catch (e: OutOfMemoryError) {
            throw WallpaperException("OUT_OF_MEMORY", "Image trop lourde pour cet appareil", e)
        } ?: throw WallpaperException("DECODE_FAILED", "Impossible de décoder l'image")

        if (decoded.width == outWidth && decoded.height == outHeight) return decoded
        val scaled = Bitmap.createScaledBitmap(decoded, outWidth, outHeight, true)
        if (scaled !== decoded) decoded.recycle()
        return scaled
    }

    private fun decodeWithRegionDecoder(file: File, rect: Rect, sample: Int): Bitmap? {
        val opts = BitmapFactory.Options().apply {
            inSampleSize = sample
            inPreferredConfig = Bitmap.Config.ARGB_8888
        }
        val decoder = try {
            if (Build.VERSION.SDK_INT >= 31) {
                BitmapRegionDecoder.newInstance(file.absolutePath)
            } else {
                @Suppress("DEPRECATION")
                BitmapRegionDecoder.newInstance(file.absolutePath, false)
            }
        } catch (e: Exception) {
            return null
        }
        return try {
            decoder.decodeRegion(rect, opts)
        } catch (e: Exception) {
            null
        } finally {
            decoder.recycle()
        }
    }

    /** Pour les formats non gérés par BitmapRegionDecoder : décodage complet puis découpe. */
    private fun decodeFallback(file: File, rect: Rect, sample: Int): Bitmap? {
        val opts = BitmapFactory.Options().apply { inSampleSize = sample }
        val full = BitmapFactory.decodeFile(file.absolutePath, opts) ?: return null
        val left = (rect.left / sample).coerceIn(0, full.width - 1)
        val top = (rect.top / sample).coerceIn(0, full.height - 1)
        val width = (rect.width() / sample).coerceIn(1, full.width - left)
        val height = (rect.height() / sample).coerceIn(1, full.height - top)
        val cropped = Bitmap.createBitmap(full, left, top, width, height)
        if (cropped !== full) full.recycle()
        return cropped
    }
}
