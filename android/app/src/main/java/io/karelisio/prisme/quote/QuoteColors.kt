package io.karelisio.prisme.quote

import kotlin.math.max
import kotlin.math.min

/**
 * Couleur et lisibilité de la phrase : texte clair ou sombre d'après la luminosité du fond à l'endroit où il
 * se pose, voile et ombre. Calculs purs, testés sur JVM, identiques à ceux de l'aperçu de l'app
 * (src/features/quote/layout.ts) : toute modification doit être reportée dans l'autre langage.
 */
internal object QuoteColors {
    /** Au-dessus de cette luminosité (0 à 1) locale, le texte automatique devient sombre. */
    const val LIGHT_LUMA_THRESHOLD = 0.58

    /** LIGHT : texte clair (blanc), DARK : texte sombre (noir). */
    enum class Tone { LIGHT, DARK }

    /** Ombre portée du texte : douce, de la couleur opposée. */
    data class Shadow(val alpha: Double, val blur: Double, val dy: Double)

    /** Bande du voile, sur toute la largeur de l'écran. */
    data class Band(val top: Double, val bottom: Double)

    /** Luminosité moyenne (0 à 1, valeurs sRGB pondérées Rec. 709) de pixels ARGB. */
    fun averageLuma(pixels: IntArray): Double {
        if (pixels.isEmpty()) return 0.0
        var sum = 0.0
        for (pixel in pixels) {
            val red = (pixel shr 16) and 0xFF
            val green = (pixel shr 8) and 0xFF
            val blue = pixel and 0xFF
            sum += 0.2126 * red + 0.7152 * green + 0.0722 * blue
        }
        return sum / pixels.size / 255
    }

    /** Texte clair ou sombre : imposé (blanc, noir) ou, en automatique, celui qui contraste avec la luminosité locale. */
    fun toneFor(color: QuoteColor, luma: Double): Tone = when (color) {
        QuoteColor.WHITE -> Tone.LIGHT
        QuoteColor.BLACK -> Tone.DARK
        QuoteColor.AUTO -> if (luma > LIGHT_LUMA_THRESHOLD) Tone.DARK else Tone.LIGHT
    }

    private fun clamp01(v: Double) = min(max(v, 0.0), 1.0)

    /** Opacité du voile (noir sous un texte clair, blanc sous un texte sombre) : plus forte quand le fond le contredit. */
    fun veilAlpha(tone: Tone, luma: Double): Double {
        val conflict = if (tone == Tone.LIGHT) clamp01((luma - 0.35) / 0.45) else clamp01((0.65 - luma) / 0.45)
        return 0.14 + 0.34 * conflict
    }

    /** Bande du voile : le bloc, élargi d'une ligne et un peu au-dessus et au-dessous, sur toute la largeur. */
    fun veilBand(plan: QuoteLayout.Plan, height: Int): Band = Band(
        top = max(0.0, plan.top - plan.fontSize * 1.2),
        bottom = min(height.toDouble(), plan.top + plan.height + plan.fontSize * 1.2),
    )

    fun shadowOf(tone: Tone, fontSize: Double): Shadow = if (tone == Tone.LIGHT) {
        Shadow(alpha = 0.55, blur = fontSize * 0.1, dy = fontSize * 0.035)
    } else {
        Shadow(alpha = 0.45, blur = fontSize * 0.08, dy = 0.0)
    }
}
