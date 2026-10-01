package io.karelisio.prisme.wallpaper

import android.content.ContentResolver
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.graphics.Matrix
import android.net.Uri
import android.os.Build
import android.util.Base64
import androidx.exifinterface.media.ExifInterface
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import kotlin.math.max
import kotlin.math.roundToInt

data class LocalImage(val file: File, val width: Int, val height: Int)

/** Copie les images importées (galerie) ou créées (éditeur, générateur) dans le stockage de l'app. */
internal class ImageImporter(private val resolver: ContentResolver, private val store: ImageStore) {

    /** Importe une image de la galerie : orientation EXIF appliquée, taille bornée, réencodée en JPEG. */
    fun importFromGallery(uri: Uri, maxDimension: Int = MAX_IMPORT_DIMENSION): LocalImage {
        val bitmap = try {
            if (Build.VERSION.SDK_INT >= 28) decodeModern(uri, maxDimension) else decodeLegacy(uri, maxDimension)
        } catch (e: OutOfMemoryError) {
            throw WallpaperException("OUT_OF_MEMORY", "Image trop lourde pour cet appareil", e)
        } catch (e: WallpaperException) {
            throw e
        } catch (e: Exception) {
            throw WallpaperException("DECODE_FAILED", "Impossible de lire cette image", e)
        }
        val out = File(store.importsRoot.apply { mkdirs() }, "${UUID.randomUUID()}.jpg")
        try {
            FileOutputStream(out).use { stream ->
                if (!bitmap.compress(Bitmap.CompressFormat.JPEG, 95, stream)) {
                    throw WallpaperException("DECODE_FAILED", "Impossible d'enregistrer l'image")
                }
            }
            return LocalImage(out, bitmap.width, bitmap.height)
        } finally {
            bitmap.recycle()
        }
    }

    /** Enregistre une image encodée en base64 (avec ou sans en-tête data:). */
    fun saveBase64(data: String, name: String?): LocalImage {
        val parsed = DataUrl.parse(data)
        val bytes = try {
            Base64.decode(parsed.payload, Base64.DEFAULT)
        } catch (e: IllegalArgumentException) {
            throw WallpaperException("INVALID_ARGUMENT", "Données d'image invalides", e)
        }
        val file = File(store.creationsRoot.apply { mkdirs() }, "${DataUrl.safeName(name)}.${parsed.extension}")
        file.writeBytes(bytes)
        val bounds = BitmapLoader.readBounds(file)
        return LocalImage(file, bounds.width, bounds.height)
    }

    private fun decodeModern(uri: Uri, maxDimension: Int): Bitmap {
        val source = ImageDecoder.createSource(resolver, uri)
        return ImageDecoder.decodeBitmap(source) { decoder, info, _ ->
            val scale = scaleFor(info.size.width, info.size.height, maxDimension)
            if (scale < 1.0) {
                decoder.setTargetSize(
                    (info.size.width * scale).roundToInt().coerceAtLeast(1),
                    (info.size.height * scale).roundToInt().coerceAtLeast(1),
                )
            }
            // Bitmap logiciel : nécessaire pour le réencodage JPEG.
            decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
        }
    }

    private fun decodeLegacy(uri: Uri, maxDimension: Int): Bitmap {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        resolver.openInputStream(uri).use { BitmapFactory.decodeStream(it, null, bounds) }
        if (bounds.outWidth <= 0) throw WallpaperException("DECODE_FAILED", "Format d'image non pris en charge")
        val sample = CropMath.sampleSize(bounds.outWidth, bounds.outHeight, maxDimension / 2, maxDimension / 2)
        val decoded = resolver.openInputStream(uri).use {
            BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
        } ?: throw WallpaperException("DECODE_FAILED", "Format d'image non pris en charge")
        val exif = resolver.openInputStream(uri).use { stream -> stream?.let { ExifInterface(it) } }
        val matrix = Matrix()
        val scale = scaleFor(decoded.width, decoded.height, maxDimension).toFloat()
        if (scale < 1f) matrix.postScale(scale, scale)
        exif?.let {
            if (it.isFlipped) matrix.postScale(-1f, 1f)
            if (it.rotationDegrees != 0) matrix.postRotate(it.rotationDegrees.toFloat())
        }
        if (matrix.isIdentity) return decoded
        val transformed = Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
        if (transformed !== decoded) decoded.recycle()
        return transformed
    }

    private fun scaleFor(width: Int, height: Int, maxDimension: Int): Double =
        minOf(1.0, maxDimension.toDouble() / max(width, height))

    companion object {
        const val MAX_IMPORT_DIMENSION = 4096
    }
}

/** Analyse des chaînes base64 envoyées par le JavaScript. */
internal object DataUrl {
    data class Parsed(val extension: String, val payload: String)

    fun parse(data: String): Parsed {
        val comma = data.indexOf(',')
        if (!data.startsWith("data:") || comma < 0) return Parsed("jpg", data)
        val header = data.substring(5, comma)
        val extension = when {
            header.startsWith("image/png") -> "png"
            header.startsWith("image/webp") -> "webp"
            else -> "jpg"
        }
        return Parsed(extension, data.substring(comma + 1))
    }

    fun safeName(name: String?): String {
        val cleaned = name?.replace(Regex("[^A-Za-z0-9_-]"), "_")?.take(64)
        return if (cleaned.isNullOrBlank()) UUID.randomUUID().toString() else cleaned
    }
}
