package io.karelisio.prisme.automation

import kotlin.math.max
import kotlin.math.min
import kotlin.random.Random

/**
 * Rotation intelligente : chaque fond passe une fois avant de revenir, la teinte change d'un fond
 * à l'autre et, la nuit, les fonds sombres passent en priorité (quand la source en contient).
 */
object SmartRotation {
    /** Index du prochain fond et fonds vus dans le cycle (qui repart de zéro une fois tout montré). */
    fun next(
        items: List<io.karelisio.prisme.wallpaper.WallpaperRef>,
        current: Int,
        seen: Set<String>,
        night: Boolean,
        random: Random,
    ): Pair<Int, List<String>> {
        if (items.size <= 1) return 0 to items.map { it.id }
        var cycle = seen.filter { id -> items.any { it.id == id } }.toSet()
        var pool = items.indices.filter { it != current && items[it].id !in cycle }
        if (pool.isEmpty()) {
            cycle = emptySet()
            pool = items.indices.filter { it != current }
        }
        if (night) pool.filter { isDark(items[it].color) }.ifEmpty { null }?.let { pool = it }
        val hue = items.getOrNull(current)?.color?.let(::hueClass)
        if (hue != null) pool.filter { hueClass(items[it].color) != hue }.ifEmpty { null }?.let { pool = it }
        val pick = pool[random.nextInt(pool.size)]
        return pick to (cycle + items[pick].id).toList()
    }

    /** Couleur moyenne sombre (luminosité perçue ≤ 0,35) ; inconnue = non. */
    fun isDark(color: String?): Boolean = rgb(color)?.let { (r, g, b) -> (0.299 * r + 0.587 * g + 0.114 * b) / 255 <= 0.35 } ?: false

    /** Famille de teinte : « sombre », « clair », « neutre » ou l'un des 6 secteurs de couleur ; null si inconnue. */
    fun hueClass(color: String?): String? {
        val (r, g, b) = rgb(color)?.map { it / 255.0 } ?: return null
        val high = max(r, max(g, b))
        val low = min(r, min(g, b))
        val lightness = (high + low) / 2
        val delta = high - low
        val saturation = if (delta == 0.0) 0.0 else delta / (1 - kotlin.math.abs(2 * lightness - 1))
        if (lightness < 0.16) return "dark"
        if (lightness > 0.88 && saturation < 0.5) return "light"
        if (saturation < 0.15) return "neutral"
        val hue = when (high) {
            r -> ((g - b) / delta).mod(6.0)
            g -> (b - r) / delta + 2
            else -> (r - g) / delta + 4
        } * 60
        return "hue${(hue / 60).toInt().coerceIn(0, 5)}"
    }

    private fun rgb(color: String?): List<Int>? {
        val hex = color?.removePrefix("#")?.takeIf { it.length == 6 } ?: return null
        val n = hex.toIntOrNull(16) ?: return null
        // Couleur « inconnue » des sources qui n'en fournissent pas.
        if (n == 0x808080) return null
        return listOf((n shr 16) and 255, (n shr 8) and 255, n and 255)
    }
}
