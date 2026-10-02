package io.karelisio.prisme.live

import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** Ajustement « couvrir » : le média remplit tout l'écran, centré ; ce qui dépasse est recadré (calcul pur, testé sur JVM). */
internal object CoverFit {
    /** Rectangle où dessiner le média, en pixels de l'écran ; [left] et [top] sont négatifs quand il dépasse. */
    data class Placement(val scale: Float, val left: Float, val top: Float, val width: Float, val height: Float)

    /** Où dessiner un média de [srcW]×[srcH] pour couvrir un écran de [dstW]×[dstH] ; null si une taille est inconnue. */
    fun place(srcW: Int, srcH: Int, dstW: Int, dstH: Int): Placement? {
        if (srcW <= 0 || srcH <= 0 || dstW <= 0 || dstH <= 0) return null
        val scale = scaleToCover(srcW, srcH, dstW, dstH)
        val width = srcW * scale
        val height = srcH * scale
        return Placement(scale, (dstW - width) / 2f, (dstH - height) / 2f, width, height)
    }

    /** Échelle minimale à laquelle le média couvre l'écran dans les deux directions. */
    fun scaleToCover(srcW: Int, srcH: Int, dstW: Int, dstH: Int): Float = max(dstW.toFloat() / srcW, dstH.toFloat() / srcH)

    /**
     * Taille à laquelle décoder un média pour qu'il couvre l'écran dans les deux orientations (le téléphone peut
     * tourner sans recharger) sans jamais l'agrandir : un grand GIF est décodé réduit, ce qui borne la mémoire.
     */
    fun decodeSize(srcW: Int, srcH: Int, screenW: Int, screenH: Int): Pair<Int, Int> {
        if (srcW <= 0 || srcH <= 0 || screenW <= 0 || screenH <= 0) return max(srcW, 1) to max(srcH, 1)
        val scale = min(1f, max(scaleToCover(srcW, srcH, screenW, screenH), scaleToCover(srcW, srcH, screenH, screenW)))
        if (scale >= 1f) return srcW to srcH
        return (srcW * scale).roundToInt().coerceAtLeast(1) to (srcH * scale).roundToInt().coerceAtLeast(1)
    }
}

/**
 * Horloge d'un GIF lu image par image (Android 8 et moins, sans décodeur animé) : la position avance avec le
 * temps réel et reboucle ; une pause ([resume] au retour) ne compte pas.
 */
internal class LoopClock(private val durationMs: Int) {
    private var position = 0L
    private var lastNanos = NONE

    /** Reprise après une pause : le temps repart de la position où il s'était arrêté. */
    fun resume() {
        lastNanos = NONE
    }

    /** Position dans la boucle (0 ≤ position < durée) à l'instant [nowNanos] (horloge monotone). */
    fun advance(nowNanos: Long): Int {
        if (durationMs <= 0) return 0
        if (lastNanos != NONE) position = (position + (nowNanos - lastNanos).coerceAtLeast(0L) / NANOS_PER_MS) % durationMs
        lastNanos = nowNanos
        return position.toInt()
    }

    private companion object {
        const val NONE = Long.MIN_VALUE
        const val NANOS_PER_MS = 1_000_000L
    }
}

/** Couleur dominante d'une image réduite (calcul pur, testé sur JVM) : sert de fond derrière les parties transparentes d'un GIF. */
internal object DominantColor {
    /** Pixels moins opaques que cela : ignorés. */
    private const val MIN_ALPHA = 128

    /** 4 bits par canal : les teintes voisines se regroupent. */
    private const val BINS = 16 * 16 * 16

    /** Couleur (ARGB, opaque) du groupe de teintes le plus fréquent parmi les [pixels] ARGB ; null si aucun n'est assez opaque. */
    fun of(pixels: IntArray): Int? {
        val count = IntArray(BINS)
        val red = LongArray(BINS)
        val green = LongArray(BINS)
        val blue = LongArray(BINS)
        for (pixel in pixels) {
            if (pixel ushr 24 < MIN_ALPHA) continue
            val r = (pixel shr 16) and 0xFF
            val g = (pixel shr 8) and 0xFF
            val b = pixel and 0xFF
            val bin = ((r shr 4) shl 8) or ((g shr 4) shl 4) or (b shr 4)
            count[bin]++
            red[bin] += r.toLong()
            green[bin] += g.toLong()
            blue[bin] += b.toLong()
        }
        var best = -1
        for (bin in 0 until BINS) if (count[bin] > 0 && (best < 0 || count[bin] > count[best])) best = bin
        if (best < 0) return null
        val n = count[best]
        return (0xFF shl 24) or ((red[best] / n).toInt() shl 16) or ((green[best] / n).toInt() shl 8) or (blue[best] / n).toInt()
    }
}
