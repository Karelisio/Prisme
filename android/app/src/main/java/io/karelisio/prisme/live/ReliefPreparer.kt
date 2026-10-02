package io.karelisio.prisme.live

import android.content.Context
import android.graphics.Bitmap
import android.util.Base64
import androidx.core.graphics.createBitmap
import androidx.core.graphics.scale
import com.getcapacitor.JSObject
import io.karelisio.prisme.wallpaper.BitmapLoader
import io.karelisio.prisme.wallpaper.CropMath
import io.karelisio.prisme.wallpaper.ImageStore
import io.karelisio.prisme.wallpaper.NormalizedRect
import io.karelisio.prisme.wallpaper.PixelRect
import io.karelisio.prisme.wallpaper.ScreenInfo
import io.karelisio.prisme.wallpaper.WallpaperException
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Prépare le relief 3D d'une photo, hors du fil principal : recadrage à la taille de l'écran plus la
 * marge, détourage du sujet (ML Kit), sujet aux bords adoucis (PNG transparent) et arrière-plan dont la
 * place du sujet est comblée (JPEG). Le détourage et le comblement se font sur une image réduite, puis
 * sont appliqués à la photo pleine taille. Le relief précédent reste en place tant que le nouveau n'est
 * pas entièrement enregistré.
 */
internal class ReliefPreparer(context: Context) {
    private val context = context.applicationContext

    /** Étapes annoncées à l'app. */
    enum class Stage(val key: String) {
        /** Téléchargement si besoin et recadrage de la photo. */
        IMAGE("image"),

        /** Téléchargement du module de détourage (la première fois). */
        MODULE("module"),
        SEGMENT("segment"),

        /** Sujet adouci, arrière-plan comblé, enregistrement. */
        COMPOSE("compose"),
    }

    /** Prépare [uri] (recadrée selon [crop]) pour l'écran [screen] ; [onProgress] suit les étapes. */
    fun prepare(uri: String, crop: NormalizedRect?, screen: ScreenInfo.Size, onProgress: (Stage, Float?) -> Unit): ReliefStore.Prepared =
        synchronized(LOCK) {
            try {
                prepareLocked(uri, crop, screen, onProgress)
            } catch (e: OutOfMemoryError) {
                throw WallpaperException("OUT_OF_MEMORY", "Image trop lourde pour cet appareil", e)
            }
        }

    private fun prepareLocked(uri: String, crop: NormalizedRect?, screen: ScreenInfo.Size, onProgress: (Stage, Float?) -> Unit): ReliefStore.Prepared {
        onProgress(Stage.IMAGE, null)
        val source = ImageStore(context).resolve(uri)
        val (width, height) = ParallaxMath.bitmapSize(screen.width, screen.height, ReliefMath.MARGIN)
        val bounds = BitmapLoader.readBounds(source)
        val region = CropMath.resolveCrop(bounds.width, bounds.height, crop, width, height)
        val photo = toArgb(BitmapLoader.decodeRegion(source, region, width, height))
        val dir = ReliefStore.dir(context)
        val stamp = System.currentTimeMillis()
        val subjectFile = File(dir, "subject-$stamp.png")
        val backgroundFile = File(dir, "background-$stamp.jpg")
        val previewFile = File(dir, "preview-$stamp.png")
        val written = listOf(subjectFile, backgroundFile, previewFile)
        try {
            // Détourage sur l'image de travail.
            val (workWidth, workHeight) = ReliefMath.workSize(width, height)
            val work = photo.scale(workWidth, workHeight)
            val workPixels = IntArray(workWidth * workHeight)
            work.getPixels(workPixels, 0, workWidth, 0, 0, workWidth, workHeight)
            val confidence = try {
                ReliefSegmenter(context).use { segmenter ->
                    val installed = segmenter.ensureModule { onProgress(Stage.MODULE, it) }
                    onProgress(Stage.SEGMENT, null)
                    segmenter.segment(work, installed)
                }
            } finally {
                if (work !== photo) work.recycle()
            }

            onProgress(Stage.COMPOSE, null)
            val coverage = ReliefMask.coverage(confidence)
            if (coverage < ReliefMath.MIN_COVERAGE) throw ReliefSegmenter.noSubject()
            val alpha = ReliefMask.subjectAlpha(confidence, workWidth, workHeight, SHRINK, FEATHER)
            val subjectBox = ReliefMask.bounds(alpha, workWidth, workHeight) ?: throw ReliefSegmenter.noSubject()
            val hole = ReliefMask.hole(confidence, workWidth, workHeight, ReliefMath.growRadius(workWidth, workHeight))
            val holeSoft = ReliefMask.boxBlur(hole, workWidth, workHeight, SOFTEN)
            val known = FloatArray(hole.size) { 1f - hole[it] }
            val filled = ReliefMask.blurInside(PushPull.fill(workPixels, workWidth, workHeight, known), workWidth, workHeight, holeSoft, FILL_BLUR)
            val holeBox = ReliefMask.bounds(holeSoft, workWidth, workHeight) ?: throw ReliefSegmenter.noSubject()

            dir.mkdirs()
            val box = ReliefMath.scaleBox(subjectBox, workWidth, workHeight, width, height, BOX_PAD)
            val subject = cutSubject(photo, box, alpha, workWidth, workHeight)
            try {
                write(subject, Bitmap.CompressFormat.PNG, 100, subjectFile)
                writePreview(subject, previewFile)
            } finally {
                subject.recycle()
            }
            val background = photo.copy(Bitmap.Config.ARGB_8888, true) ?: throw WallpaperException("OUT_OF_MEMORY", "Image trop lourde pour cet appareil")
            photo.recycle()
            try {
                val area = ReliefMath.scaleBox(holeBox, workWidth, workHeight, width, height, BOX_PAD)
                fillBackground(background, area, holeSoft, filled, workWidth, workHeight)
                write(background, Bitmap.CompressFormat.JPEG, JPEG_QUALITY, backgroundFile)
            } finally {
                background.recycle()
            }

            val prepared = ReliefStore.Prepared(
                background = backgroundFile.absolutePath,
                subject = subjectFile.absolutePath,
                preview = previewFile.absolutePath,
                imageWidth = width,
                imageHeight = height,
                subjectLeft = box.left,
                subjectTop = box.top,
                subjectWidth = box.width,
                subjectHeight = box.height,
                source = uri,
                coverage = coverage,
            )
            ReliefStore.save(context, prepared)
            // Le service recharge le nouveau relief : les fichiers précédents ne servent plus.
            val keep = written.map { it.name }.toSet()
            dir.listFiles()?.filter { it.name !in keep }?.forEach { it.delete() }
            return prepared
        } catch (e: Throwable) {
            written.forEach { it.delete() }
            throw e
        } finally {
            photo.recycle()
        }
    }

    /** Le calcul des pixels suppose des couleurs ARGB sur 8 bits. */
    private fun toArgb(bitmap: Bitmap): Bitmap {
        if (bitmap.config == Bitmap.Config.ARGB_8888) return bitmap
        val copy = bitmap.copy(Bitmap.Config.ARGB_8888, false)
        bitmap.recycle()
        return copy ?: throw WallpaperException("DECODE_FAILED", "Format d'image non pris en charge")
    }

    /** Sujet découpé dans [photo] sur [box] ; alpha adouci interpolé depuis l'image de travail. */
    private fun cutSubject(photo: Bitmap, box: PixelRect, alpha: FloatArray, workWidth: Int, workHeight: Int): Bitmap {
        val out = createBitmap(box.width, box.height)
        val sx = workWidth.toFloat() / photo.width
        val sy = workHeight.toFloat() / photo.height
        forEachBand(photo, box) { band, y, rows ->
            for (row in 0 until rows) {
                val v = (y + row + 0.5f) * sy - 0.5f
                val offset = row * box.width
                for (col in 0 until box.width) {
                    val u = (box.left + col + 0.5f) * sx - 0.5f
                    val a = (ReliefMask.sample(alpha, workWidth, workHeight, u, v) * 255f).roundToInt().coerceIn(0, 255)
                    // Couleurs non prémultipliées (setPixels) : l'alpha remplace simplement celui de la photo.
                    band[offset + col] = if (a == 0) 0 else (a shl 24) or (band[offset + col] and 0xFFFFFF)
                }
            }
            out.setPixels(band, 0, box.width, 0, y - box.top, box.width, rows)
        }
        return out
    }

    /** Remplace la place du sujet dans [background] par le comblement [filled], selon le poids [weight]. */
    private fun fillBackground(background: Bitmap, box: PixelRect, weight: FloatArray, filled: IntArray, workWidth: Int, workHeight: Int) {
        val sx = workWidth.toFloat() / background.width
        val sy = workHeight.toFloat() / background.height
        forEachBand(background, box) { band, y, rows ->
            for (row in 0 until rows) {
                val v = (y + row + 0.5f) * sy - 0.5f
                val offset = row * box.width
                for (col in 0 until box.width) {
                    val u = (box.left + col + 0.5f) * sx - 0.5f
                    val t = ReliefMask.sample(weight, workWidth, workHeight, u, v)
                    if (t <= 0f) continue
                    val fill = ReliefMask.sampleColor(filled, workWidth, workHeight, u, v)
                    band[offset + col] = ReliefMask.mix(band[offset + col], fill, t)
                }
            }
            background.setPixels(band, 0, box.width, box.left, y, box.width, rows)
        }
    }

    /** Lit [box] de [bitmap] par bandes de lignes (mémoire bornée) : [block] reçoit la bande, sa première ligne et son nombre de lignes. */
    private inline fun forEachBand(bitmap: Bitmap, box: PixelRect, block: (band: IntArray, y: Int, rows: Int) -> Unit) {
        val rowsPerBand = max(1, min(box.height, BAND_PIXELS / max(1, box.width)))
        val band = IntArray(box.width * rowsPerBand)
        var y = box.top
        while (y < box.bottom) {
            val rows = min(rowsPerBand, box.bottom - y)
            bitmap.getPixels(band, 0, box.width, box.left, y, box.width, rows)
            block(band, y, rows)
            y += rows
        }
    }

    private fun writePreview(subject: Bitmap, out: File) {
        val scale = min(1f, PREVIEW_SIDE.toFloat() / max(subject.width, subject.height))
        val thumb = subject.scale(max(1, (subject.width * scale).roundToInt()), max(1, (subject.height * scale).roundToInt()))
        try {
            write(thumb, Bitmap.CompressFormat.PNG, 100, out)
        } finally {
            if (thumb !== subject) thumb.recycle()
        }
    }

    /** Écriture dans un fichier temporaire puis renommé : le service ne tombe jamais sur une image à moitié écrite. */
    private fun write(bitmap: Bitmap, format: Bitmap.CompressFormat, quality: Int, out: File) {
        val tmp = File(out.parentFile, "${out.name}.part")
        try {
            val done = FileOutputStream(tmp).use { bitmap.compress(format, quality, it) }
            if (!done || !tmp.renameTo(out)) throw WallpaperException("WRITE_FAILED", "Impossible d'enregistrer le relief")
        } finally {
            tmp.delete()
        }
    }

    companion object {
        /** Une préparation à la fois (deux demandes rapprochées passent l'une après l'autre). */
        private val LOCK = Any()

        /** Resserrement et adoucissement du contour du sujet, en pixels de l'image de travail. */
        private const val SHRINK = 1
        private const val FEATHER = 1

        /** Adoucissement du bord de la zone comblée et léger flou du comblement (pixels de travail). */
        private const val SOFTEN = 2
        private const val FILL_BLUR = 2

        /** Marge autour des zones ramenées à la pleine taille (pixels). */
        private const val BOX_PAD = 2

        private const val BAND_PIXELS = 256 * 1024
        private const val PREVIEW_SIDE = 256
        private const val JPEG_QUALITY = 90

        /** État pour l'app : relief prêt ou non, image d'origine, vignette du sujet (data URL). */
        fun info(context: Context, prepared: ReliefStore.Prepared? = ReliefStore.read(context)): JSObject {
            val result = JSObject().put("ready", prepared != null)
            if (prepared == null) return result
            result.put("source", prepared.source).put("coverage", prepared.coverage.toDouble())
            previewDataUrl(prepared.preview)?.let { result.put("preview", it) }
            return result
        }

        private fun previewDataUrl(path: String): String? {
            if (path.isEmpty()) return null
            return try {
                "data:image/png;base64," + Base64.encodeToString(File(path).readBytes(), Base64.NO_WRAP)
            } catch (e: IOException) {
                null
            }
        }
    }
}
