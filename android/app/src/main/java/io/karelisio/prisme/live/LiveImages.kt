package io.karelisio.prisme.live

import android.content.Context
import android.graphics.Bitmap
import io.karelisio.prisme.wallpaper.BitmapLoader
import io.karelisio.prisme.wallpaper.CropMath
import io.karelisio.prisme.wallpaper.ImageStore
import io.karelisio.prisme.wallpaper.NormalizedRect
import io.karelisio.prisme.wallpaper.ScreenInfo
import io.karelisio.prisme.wallpaper.WallpaperException
import java.io.File
import java.io.FileOutputStream

/** Prépare les images du fond animé : à la taille de l'écran plus la marge de parallaxe, en JPEG. */
internal class LiveImages(private val context: Context) {
    /**
     * Télécharge [uri] si besoin, la recadre (au centre, ou selon [crop]) à la taille de l'écran plus la
     * marge de parallaxe de [intensity] et l'écrit dans [out]. Écriture dans un fichier temporaire puis
     * renommé : le service ne tombe jamais sur une image à moitié écrite.
     */
    fun prepareTo(uri: String, intensity: Float, crop: NormalizedRect?, screen: ScreenInfo.Size, out: File) {
        val source = ImageStore(context).resolve(uri)
        val margin = ParallaxMath.margin(intensity)
        val (width, height) = ParallaxMath.bitmapSize(screen.width, screen.height, margin)
        val bounds = BitmapLoader.readBounds(source)
        val region = CropMath.resolveCrop(bounds.width, bounds.height, crop, width, height)
        val bitmap = BitmapLoader.decodeRegion(source, region, width, height)
        out.parentFile?.mkdirs()
        val tmp = File(out.parentFile, "${out.name}.part")
        try {
            val written = FileOutputStream(tmp).use { bitmap.compress(Bitmap.CompressFormat.JPEG, 92, it) }
            if (!written || !tmp.renameTo(out)) throw WallpaperException("WRITE_FAILED", "Impossible d'enregistrer l'image")
        } finally {
            bitmap.recycle()
            tmp.delete()
        }
    }
}
