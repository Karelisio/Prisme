package io.karelisio.prisme.automation

import android.content.Context
import org.json.JSONObject
import kotlin.math.min
import kotlin.math.roundToInt

/** « Assombrir le soir » : intensité maximale et lieu dont le soleil cale l'assombrissement. */
data class DimConfig(val enabled: Boolean = false, val max: Float = 0.4f, val sun: GeoPoint? = null) {
    companion object {
        fun fromJson(json: JSONObject?): DimConfig {
            if (json == null) return DimConfig()
            val sun = json.optJSONObject("sun")?.takeIf { it.has("latitude") && it.has("longitude") }
                ?.let { GeoPoint(it.optDouble("latitude"), it.optDouble("longitude")) }
            return DimConfig(json.optBoolean("enabled"), json.optDouble("max", 0.4).toFloat().coerceIn(0f, 0.7f), sun)
        }
    }
}

/**
 * Assombrissement progressif des fonds appliqués par Prisme : nul le jour, il monte pendant 1 h 30
 * après le coucher du soleil, puis s'efface dans l'heure qui précède le lever.
 */
object EveningDim {
    private const val RISE_MINUTES = 90.0
    private const val FADE_MINUTES = 60.0
    private const val STEP = 0.05f
    private const val DAY = 24 * 60

    /** Niveau (0 à `max`) arrondi par paliers de 5 % : le fond n'est réappliqué qu'au changement de palier. */
    fun level(config: DimConfig, moment: Moment): Float {
        if (!config.enabled || config.max <= 0f) return 0f
        val times = config.sun?.let { SunTimes.compute(it, moment) } ?: SunTimes.Times(7 * 60, 21 * 60)
        val nightLength = (times.sunrise - times.sunset).mod(DAY)
        val sinceSunset = (moment.minuteOfDay - times.sunset).mod(DAY)
        if (sinceSunset >= nightLength) return 0f
        val untilSunrise = nightLength - sinceSunset
        val ratio = min(min(1.0, sinceSunset / RISE_MINUTES), min(1.0, untilSunrise / FADE_MINUTES))
        return ((config.max * ratio / STEP).roundToInt() * STEP).coerceIn(0f, config.max)
    }

    /** Niveau à appliquer maintenant (0 si l'option est coupée). */
    fun current(context: Context): Float = level(AutomationStore(context).config().dim, AutomationStore.now())
}
