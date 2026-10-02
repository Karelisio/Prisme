package io.karelisio.prisme.live

import io.karelisio.prisme.wallpaper.WallpaperRef
import org.json.JSONArray
import org.json.JSONException
import kotlin.math.roundToInt
import kotlin.random.Random

/** Calculs du changement d'image à chaque déverrouillage (purs, testés sur JVM). */
object UnlockPlaylist {
    /** Images de la liste au maximum : chacune pèse environ 1 Mo une fois préparée. */
    const val MAX_ITEMS = 50

    /** Déverrouillages au maximum entre deux changements. */
    const val MAX_EVERY = 100

    const val DEFAULT_EVERY = 1

    /** Durée du fondu enchaîné entre l'ancienne et la nouvelle image. */
    const val FADE_MS = 400L

    /** Deux annonces plus proches que cela viennent du même déverrouillage (plusieurs moteurs actifs). */
    const val DEBOUNCE_MS = 1_000L

    fun clampEvery(every: Int): Int = every.coerceIn(1, MAX_EVERY)

    /** Images retenues pour la liste : sans doublon d'identifiant, [MAX_ITEMS] au plus. */
    fun select(items: List<WallpaperRef>): List<WallpaperRef> = items.distinctBy { it.id }.take(MAX_ITEMS)

    /** Compteur après un déverrouillage, et si l'image doit changer. */
    data class Tick(val counter: Int, val change: Boolean)

    /** Un déverrouillage de plus : à la fréquence voulue, le compteur repart de zéro et l'image change. */
    fun tick(counter: Int, every: Int): Tick {
        val next = counter.coerceAtLeast(0) + 1
        return if (next >= clampEvery(every)) Tick(0, true) else Tick(next, false)
    }

    /** Suite d'un déverrouillage : nouveau compteur et, si l'image change, la position de la suivante. */
    data class Step(val counter: Int, val nextIndex: Int?)

    /**
     * Un déverrouillage sur une liste de [size] images dont la [current] est affichée : compteur, puis à la
     * fréquence voulue l'image suivante, au hasard.
     */
    fun step(counter: Int, every: Int, size: Int, current: Int, random: Random): Step {
        val tick = tick(counter, every)
        return Step(tick.counter, if (tick.change) nextIndex(size, current, random) else null)
    }

    /**
     * Position de l'image suivante : au hasard, sans jamais reprendre l'image affichée ([current], -1 si
     * ce n'est aucune de la liste). Une liste d'une seule image la reprend ; -1 si la liste est vide.
     */
    fun nextIndex(size: Int, current: Int, random: Random): Int {
        if (size <= 0) return -1
        if (current !in 0 until size) return random.nextInt(size)
        if (size == 1) return 0
        val pick = random.nextInt(size - 1)
        return if (pick >= current) pick + 1 else pick
    }

    /** Position de l'image affichée dans la nouvelle liste, retrouvée par son chemin (-1 : elle n'y est plus). */
    fun remapIndex(oldPaths: List<String>, oldIndex: Int, newPaths: List<String>): Int {
        val shown = oldPaths.getOrNull(oldIndex) ?: return -1
        return newPaths.indexOf(shown)
    }

    /** Vrai si [now] est trop proche du dernier déverrouillage compté ([lastAt]) pour en être un autre. */
    fun isDuplicate(now: Long, lastAt: Long): Boolean = now - lastAt in 0 until DEBOUNCE_MS

    /** Opacité (0..255) de la nouvelle image [elapsedMs] après le début du fondu : progression douce. */
    fun fadeAlpha(elapsedMs: Long): Int {
        val t = (elapsedMs.toFloat() / FADE_MS).coerceIn(0f, 1f)
        return (t * t * (3f - 2f * t) * 255f).roundToInt()
    }

    fun encodePaths(paths: List<String>): String = JSONArray(paths).toString()

    /** Chemins enregistrés ; une valeur illisible donne une liste vide. */
    fun decodePaths(raw: String?): List<String> {
        if (raw.isNullOrBlank()) return emptyList()
        return try {
            val array = JSONArray(raw)
            (0 until array.length()).mapNotNull { array.opt(it) as? String }.filter { it.isNotEmpty() }
        } catch (e: JSONException) {
            emptyList()
        }
    }
}
