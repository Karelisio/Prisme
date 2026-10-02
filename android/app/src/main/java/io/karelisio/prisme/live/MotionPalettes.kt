package io.karelisio.prisme.live

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Palette des fonds animés (dégradé, fond des particules) : base sombre et couleurs des taches, en ARGB.
 * [gain] atténue les taches des palettes très claires (pastel) pour garder des zones sombres.
 */
class MotionPalette(val key: String, val base: Int, val colors: IntArray, val gain: Float = 1f) {
    fun color(index: Int): Int = colors[index.mod(colors.size)]
}

/** Palettes proposées et calculs de couleur (purs, testés sur JVM). */
object MotionPalettes {
    /** Couleurs du système (Material You, Android 12+) ; avant, couleur d'accent de l'app. */
    const val SYSTEM = "system"

    const val DEFAULT = "aurora"

    /** Couleur d'accent par défaut de l'app (thème Prisme). */
    const val APP_ACCENT = 0xFF6750A4.toInt()

    private const val OPAQUE = 0xFF shl 24
    private const val BLACK = OPAQUE

    /** Préréglages : base très sombre et cinq couleurs lumineuses qui se mélangent en mode « écran ». */
    val PRESETS: List<MotionPalette> = listOf(
        MotionPalette("aurora", rgb(0x020812), rgbs(0x12D99B, 0x0B9FC4, 0x5A3EE6, 0x1D63E0, 0xB544D6)),
        MotionPalette("sunset", rgb(0x12050F), rgbs(0xFF6B3D, 0xF2306A, 0xFFB347, 0x8E2FC9, 0xFF8A9A)),
        MotionPalette("ocean", rgb(0x010C16), rgbs(0x0A9FD6, 0x0D5FD0, 0x14C7BB, 0x2A36B0, 0x62D6EC)),
        MotionPalette("forest", rgb(0x030E08), rgbs(0x2A9A57, 0x86BF3E, 0x14694A, 0xC4A94C, 0x35B39B)),
        MotionPalette("neon", rgb(0x06010D), rgbs(0xFF27D0, 0x00DCFF, 0x7224FF, 0x2CFF86, 0xFFE14D)),
        MotionPalette("pastel", rgb(0x16131D), rgbs(0xF7A8C4, 0xA9DCF7, 0xCDB9FB, 0xBDF0CF, 0xFFD9A6), gain = 0.72f),
    )

    /** Ordre des puces dans l'app et du double-tap. */
    val KEYS: List<String> = listOf(SYSTEM) + PRESETS.map { it.key }

    fun preset(key: String): MotionPalette? = PRESETS.firstOrNull { it.key == key }

    /** Palette connue, sinon celle par défaut. */
    fun normalize(key: String?): String = if (key != null && key in KEYS) key else DEFAULT

    /** Palette suivante (double-tap), en boucle. */
    fun next(key: String): String = KEYS[(KEYS.indexOf(key) + 1).mod(KEYS.size)]

    /**
     * Palette Material You à partir des couleurs du système (tons Android : 300 clair, 500 moyen, 900 très
     * sombre) : base presque noire teintée de la couleur principale.
     */
    fun fromSystem(accent1Tone300: Int, accent1Tone500: Int, accent2Tone500: Int, accent3Tone400: Int, accent3Tone600: Int, accent1Tone900: Int) =
        MotionPalette(
            SYSTEM,
            lerpColor(BLACK, accent1Tone900 or OPAQUE, 0.55f),
            intArrayOf(accent1Tone500, accent3Tone400, accent2Tone500, accent1Tone300, accent3Tone600).map { it or OPAQUE }.toIntArray(),
        )

    /** Palette tirée d'une seule couleur d'accent (avant Android 12) : teintes voisines, base très sombre. */
    fun fromAccent(accent: Int): MotionPalette {
        val hsl = toHsl(accent)
        val hue = hsl[0]
        val saturation = hsl[1].coerceIn(0.35f, 0.8f)
        return MotionPalette(
            SYSTEM,
            fromHsl(hue, min(saturation, 0.5f), 0.05f),
            intArrayOf(
                fromHsl(hue, saturation, 0.55f),
                fromHsl(hue + 40f, saturation * 0.9f, 0.52f),
                fromHsl(hue - 45f, saturation * 0.85f, 0.58f),
                fromHsl(hue + 10f, saturation * 0.7f, 0.72f),
                fromHsl(hue + 80f, saturation * 0.8f, 0.45f),
            ),
        )
    }

    /** « #RRGGBB » en couleur opaque ; null si illisible. */
    fun parseColor(value: String?): Int? {
        val hex = value?.trim()?.removePrefix("#") ?: return null
        if (hex.length != 6) return null
        return hex.toIntOrNull(16)?.let { it or OPAQUE }
    }

    /** Mélange de deux couleurs ARGB, canal par canal ([t] de 0 à 1). */
    fun lerpColor(from: Int, to: Int, t: Float): Int {
        val k = t.coerceIn(0f, 1f)
        var out = 0
        for (shift in intArrayOf(24, 16, 8, 0)) {
            val a = (from ushr shift) and 0xFF
            val b = (to ushr shift) and 0xFF
            out = out or ((a + (b - a) * k).roundToInt().coerceIn(0, 255) shl shift)
        }
        return out
    }

    /** Teinte (degrés), saturation et luminosité (0..1). */
    fun toHsl(color: Int): FloatArray {
        val r = ((color shr 16) and 0xFF) / 255f
        val g = ((color shr 8) and 0xFF) / 255f
        val b = (color and 0xFF) / 255f
        val high = max(r, max(g, b))
        val low = min(r, min(g, b))
        val lightness = (high + low) / 2f
        val delta = high - low
        if (delta < 1e-6f) return floatArrayOf(0f, 0f, lightness)
        val saturation = delta / (1f - abs(2f * lightness - 1f))
        val hue = when (high) {
            r -> 60f * (((g - b) / delta).mod(6f))
            g -> 60f * ((b - r) / delta + 2f)
            else -> 60f * ((r - g) / delta + 4f)
        }
        return floatArrayOf(hue, saturation.coerceIn(0f, 1f), lightness)
    }

    fun fromHsl(hue: Float, saturation: Float, lightness: Float): Int {
        val h = hue.mod(360f)
        val s = saturation.coerceIn(0f, 1f)
        val l = lightness.coerceIn(0f, 1f)
        val chroma = (1f - abs(2f * l - 1f)) * s
        val x = chroma * (1f - abs((h / 60f).mod(2f) - 1f))
        val m = l - chroma / 2f
        val (r, g, b) = when {
            h < 60f -> Triple(chroma, x, 0f)
            h < 120f -> Triple(x, chroma, 0f)
            h < 180f -> Triple(0f, chroma, x)
            h < 240f -> Triple(0f, x, chroma)
            h < 300f -> Triple(x, 0f, chroma)
            else -> Triple(chroma, 0f, x)
        }
        fun channel(v: Float) = ((v + m) * 255f).roundToInt().coerceIn(0, 255)
        return OPAQUE or (channel(r) shl 16) or (channel(g) shl 8) or channel(b)
    }

    private fun rgb(value: Int): Int = value or OPAQUE

    private fun rgbs(vararg values: Int): IntArray = IntArray(values.size) { rgb(values[it]) }
}
