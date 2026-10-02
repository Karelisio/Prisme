package io.karelisio.prisme.music

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadata
import androidx.core.net.toUri
import io.karelisio.prisme.wallpaper.CropMath
import io.karelisio.prisme.wallpaper.Downloader
import java.io.File
import java.io.InputStream

/**
 * Pochette fournie par le lecteur : un bitmap dans les métadonnées, à défaut l'image que désigne un
 * URI (content, file ou https). Sans image exploitable, on ne fait rien.
 */
internal object ArtworkSource {
    /** Assez pour une pochette de 72 % d'un écran large, sans décoder des images de plusieurs mégapixels. */
    private const val MAX_SIDE = 1024

    private val BITMAP_KEYS = listOf(
        MediaMetadata.METADATA_KEY_ALBUM_ART,
        MediaMetadata.METADATA_KEY_ART,
        MediaMetadata.METADATA_KEY_DISPLAY_ICON,
    )
    private val URI_KEYS = listOf(
        MediaMetadata.METADATA_KEY_ALBUM_ART_URI,
        MediaMetadata.METADATA_KEY_ART_URI,
        MediaMetadata.METADATA_KEY_DISPLAY_ICON_URI,
    )

    /** À appeler hors du fil principal : un URI peut demander un téléchargement. */
    fun load(context: Context, metadata: MediaMetadata): Bitmap? {
        BITMAP_KEYS.firstNotNullOfOrNull { metadata.getBitmap(it) }?.let { return it }
        for (key in URI_KEYS) {
            val uri = metadata.getString(key)?.takeIf { it.isNotBlank() } ?: continue
            decodeUri(context, uri)?.let { return it }
        }
        return null
    }

    private fun decodeUri(context: Context, uri: String): Bitmap? = try {
        val parsed = uri.toUri()
        when (parsed.scheme) {
            "content", "file" -> decode { context.contentResolver.openInputStream(parsed) }
            "https", "http" -> download(context, uri)
            else -> null
        }
    } catch (e: Exception) {
        // Image injoignable ou illisible : pas de pochette pour ce morceau, sans bruit.
        null
    } catch (e: OutOfMemoryError) {
        null
    }

    private fun download(context: Context, url: String): Bitmap? {
        val file = File(ArtworkFiles.dir(context), "source-${System.nanoTime()}.tmp")
        try {
            Downloader.download(url, file, null)
            return decode { file.inputStream() }
        } finally {
            file.delete()
        }
    }

    /** Lit les dimensions puis décode en sous-échantillonnant ; [open] est appelé deux fois. */
    private fun decode(open: () -> InputStream?): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        open()?.use { BitmapFactory.decodeStream(it, null, bounds) }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        val options = BitmapFactory.Options().apply {
            inSampleSize = CropMath.sampleSize(bounds.outWidth, bounds.outHeight, MAX_SIDE, MAX_SIDE)
        }
        return open()?.use { BitmapFactory.decodeStream(it, null, options) }
    }
}
