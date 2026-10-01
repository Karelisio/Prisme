package io.karelisio.prisme.wallpaper

import kotlin.math.max
import kotlin.math.roundToInt

/** Zone de recadrage normalisée (0..1) par rapport aux dimensions de l'image. */
data class NormalizedRect(val x: Double, val y: Double, val width: Double, val height: Double)

/** Rectangle en pixels ; droite et bas exclusifs, comme android.graphics.Rect. */
data class PixelRect(val left: Int, val top: Int, val right: Int, val bottom: Int) {
    val width: Int get() = right - left
    val height: Int get() = bottom - top
}

object CropMath {
    private const val MIN_SIDE = 1e-4
    private val FULL = NormalizedRect(0.0, 0.0, 1.0, 1.0)

    /**
     * Convertit un recadrage normalisé en pixels, ramené au ratio de la cible et contenu dans l'image.
     * Sans recadrage, renvoie la plus grande zone centrée au ratio de la cible (comportement « cover »).
     */
    fun resolveCrop(
        imageWidth: Int,
        imageHeight: Int,
        crop: NormalizedRect?,
        targetWidth: Int,
        targetHeight: Int,
    ): PixelRect {
        require(imageWidth > 0 && imageHeight > 0) { "Image vide" }
        require(targetWidth > 0 && targetHeight > 0) { "Cible vide" }
        val aspect = targetWidth.toDouble() / targetHeight
        val c = crop?.let(::sanitize) ?: FULL

        var w = c.width * imageWidth
        var h = c.height * imageHeight
        val centerX = (c.x + c.width / 2) * imageWidth
        val centerY = (c.y + c.height / 2) * imageHeight

        // Ramène la zone au ratio de l'écran en réduisant le côté excédentaire.
        if (w / h > aspect) w = h * aspect else h = w / aspect
        // La zone ne peut pas dépasser l'image.
        if (w > imageWidth) {
            w = imageWidth.toDouble()
            h = w / aspect
        }
        if (h > imageHeight) {
            h = imageHeight.toDouble()
            w = h * aspect
        }

        val cx = centerX.coerceIn(w / 2, imageWidth - w / 2)
        val cy = centerY.coerceIn(h / 2, imageHeight - h / 2)
        val left = (cx - w / 2).roundToInt().coerceIn(0, imageWidth - 1)
        val top = (cy - h / 2).roundToInt().coerceIn(0, imageHeight - 1)
        val right = (left + max(1, w.roundToInt())).coerceAtMost(imageWidth)
        val bottom = (top + max(1, h.roundToInt())).coerceAtMost(imageHeight)
        return PixelRect(left, top, right, bottom)
    }

    /** Plus grand facteur de sous-échantillonnage (puissance de 2) qui garde au moins la taille demandée. */
    fun sampleSize(sourceWidth: Int, sourceHeight: Int, requestedWidth: Int, requestedHeight: Int): Int {
        var sample = 1
        while (sourceWidth / (sample * 2) >= requestedWidth && sourceHeight / (sample * 2) >= requestedHeight) {
            sample *= 2
        }
        return sample
    }

    private fun sanitize(r: NormalizedRect): NormalizedRect {
        if (!(r.x.isFinite() && r.y.isFinite() && r.width.isFinite() && r.height.isFinite())) return FULL
        val x = r.x.coerceIn(0.0, 1.0 - MIN_SIDE)
        val y = r.y.coerceIn(0.0, 1.0 - MIN_SIDE)
        val w = r.width.coerceIn(MIN_SIDE, 1.0 - x)
        val h = r.height.coerceIn(MIN_SIDE, 1.0 - y)
        return NormalizedRect(x, y, w, h)
    }
}
