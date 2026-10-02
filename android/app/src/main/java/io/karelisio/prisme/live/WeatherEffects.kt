package io.karelisio.prisme.live

import org.json.JSONObject
import java.util.Locale
import kotlin.math.abs
import kotlin.math.max
import kotlin.random.Random

/** Effet de la météo animée. Ciel clair ou nuageux : rien n'est dessiné. */
enum class WeatherEffect(val key: String) {
    NONE("none"),
    DRIZZLE("drizzle"),
    RAIN("rain"),
    SNOW("snow"),
    FOG("fog"),
    STORM("storm"),
    ;

    companion object {
        fun fromKey(key: String?): WeatherEffect? = entries.firstOrNull { it.key == key }
    }
}

/** Météo relevée (Open-Meteo) : code WMO, précipitations (mm), vent (km/h), jour ou nuit, lieu et heure du relevé. */
data class WeatherReading(
    val code: Int,
    val precipitation: Float,
    val windKmh: Float,
    val isDay: Boolean,
    val latitude: Double,
    val longitude: Double,
    val fetchedAt: Long,
)

/**
 * Ce que dessine la couche : effet, intensité (0..1, nombre de gouttes ou de flocons), inclinaison de la
 * pluie (radians), dérive due au vent (0..1), pénombre ajoutée par-dessus la photo (0..1) et nuit.
 */
data class WeatherLook(
    val effect: WeatherEffect,
    val intensity: Float,
    val slant: Float,
    val drift: Float,
    val dim: Float,
    val night: Boolean,
) {
    companion object {
        val NONE = WeatherLook(WeatherEffect.NONE, 0f, 0f, 0f, 0f, false)
    }
}

/**
 * Réglages de la météo animée, rangés dans les réglages du genre photo (`scene_image` → `weather`) :
 * lieu suivi et aperçu forcé (null : la météo réelle).
 */
data class WeatherSettings(
    val enabled: Boolean,
    val latitude: Double?,
    val longitude: Double?,
    val preview: WeatherEffect?,
) {
    val hasPlace: Boolean get() = latitude != null && longitude != null

    companion object {
        val OFF = WeatherSettings(false, null, null, null)
    }
}

/** Calculs de la météo animée (purs, testés sur JVM). */
object WeatherRules {
    /** Relevé gardé au moins 30 min ; après un échec (hors ligne), nouvel essai 10 min plus tard. */
    const val REFRESH_MS = 30 * 60_000L
    const val RETRY_MS = 10 * 60_000L

    /** Vent (km/h) qui donne l'inclinaison maximale de la pluie. */
    private const val STRONG_WIND_KMH = 50f

    /** Précipitations (mm) qui ajoutent le maximum de gouttes en plus de ce que dit le code. */
    private const val HEAVY_PRECIPITATION_MM = 4f

    fun settings(scene: JSONObject): WeatherSettings {
        val weather = scene.optJSONObject("weather") ?: return WeatherSettings.OFF
        val latitude = weather.optDouble("latitude", Double.NaN)
        val longitude = weather.optDouble("longitude", Double.NaN)
        val valid = !latitude.isNaN() && !longitude.isNaN() && abs(latitude) <= 90.0 && abs(longitude) <= 180.0
        return WeatherSettings(
            enabled = weather.optBoolean("enabled", false),
            latitude = if (valid) latitude else null,
            longitude = if (valid) longitude else null,
            preview = WeatherEffect.fromKey(weather.optString("preview")).takeIf { it != WeatherEffect.NONE },
        )
    }

    /** Effet et intensité de base d'un code météo WMO. */
    fun effectOf(code: Int): Pair<WeatherEffect, Float> = when (code) {
        45 -> WeatherEffect.FOG to 0.7f
        48 -> WeatherEffect.FOG to 0.85f
        51 -> WeatherEffect.DRIZZLE to 0.35f
        53 -> WeatherEffect.DRIZZLE to 0.55f
        55 -> WeatherEffect.DRIZZLE to 0.75f
        56 -> WeatherEffect.DRIZZLE to 0.45f
        57 -> WeatherEffect.DRIZZLE to 0.7f
        61 -> WeatherEffect.RAIN to 0.4f
        63 -> WeatherEffect.RAIN to 0.65f
        65 -> WeatherEffect.RAIN to 0.95f
        66 -> WeatherEffect.RAIN to 0.5f
        67 -> WeatherEffect.RAIN to 0.85f
        80 -> WeatherEffect.RAIN to 0.45f
        81 -> WeatherEffect.RAIN to 0.7f
        82 -> WeatherEffect.RAIN to 1f
        71 -> WeatherEffect.SNOW to 0.35f
        73 -> WeatherEffect.SNOW to 0.6f
        75 -> WeatherEffect.SNOW to 0.9f
        77 -> WeatherEffect.SNOW to 0.3f
        85 -> WeatherEffect.SNOW to 0.5f
        86 -> WeatherEffect.SNOW to 0.85f
        95 -> WeatherEffect.STORM to 0.75f
        96 -> WeatherEffect.STORM to 0.85f
        99 -> WeatherEffect.STORM to 1f
        else -> WeatherEffect.NONE to 0f
    }

    /** Ce qu'il faut dessiner : l'aperçu choisi dans l'app, sinon la météo relevée (rien sans relevé). */
    fun look(reading: WeatherReading?, preview: WeatherEffect?): WeatherLook {
        if (preview != null) return previewLook(preview)
        if (reading == null) return WeatherLook.NONE
        val (effect, base) = effectOf(reading.code)
        if (effect == WeatherEffect.NONE) return WeatherLook.NONE
        val precipitation = if (reading.precipitation.isNaN()) 0f else reading.precipitation
        val boost = if (effect == WeatherEffect.FOG) 0f else (precipitation.coerceIn(0f, HEAVY_PRECIPITATION_MM) / HEAVY_PRECIPITATION_MM) * 0.3f
        val wind = if (reading.windKmh.isNaN()) 0f else (reading.windKmh / STRONG_WIND_KMH).coerceIn(0f, 1f)
        return shape(effect, (base + boost).coerceIn(0.2f, 1f), wind, night = !reading.isDay)
    }

    /** Aperçu : l'effet à une intensité typique, avec un peu de vent. */
    fun previewLook(effect: WeatherEffect): WeatherLook = when (effect) {
        WeatherEffect.NONE -> WeatherLook.NONE
        WeatherEffect.DRIZZLE -> shape(effect, 0.55f, 0.2f, night = false)
        WeatherEffect.RAIN -> shape(effect, 0.65f, 0.3f, night = false)
        WeatherEffect.SNOW -> shape(effect, 0.6f, 0.2f, night = false)
        WeatherEffect.FOG -> shape(effect, 0.75f, 0.2f, night = false)
        WeatherEffect.STORM -> shape(effect, 0.9f, 0.7f, night = false)
    }

    private fun shape(effect: WeatherEffect, intensity: Float, wind: Float, night: Boolean): WeatherLook {
        val rainy = effect == WeatherEffect.RAIN || effect == WeatherEffect.DRIZZLE || effect == WeatherEffect.STORM
        val dim = when (effect) {
            WeatherEffect.RAIN -> 0.10f + 0.12f * intensity
            WeatherEffect.STORM -> 0.24f
            WeatherEffect.DRIZZLE -> 0.08f
            WeatherEffect.SNOW -> 0.05f
            WeatherEffect.FOG, WeatherEffect.NONE -> 0f
        }
        return WeatherLook(
            effect = effect,
            intensity = intensity,
            slant = if (rainy) 0.06f + 0.42f * wind else 0f,
            drift = wind,
            dim = dim,
            night = night,
        )
    }

    fun url(latitude: Double, longitude: Double): String = String.format(
        Locale.US,
        "https://api.open-meteo.com/v1/forecast?latitude=%.4f&longitude=%.4f&current=weather_code,precipitation,wind_speed_10m,is_day",
        latitude,
        longitude,
    )

    /** Réponse d'Open-Meteo pour le lieu ([latitude], [longitude]) relevée à [now]. */
    fun parse(body: String, latitude: Double, longitude: Double, now: Long): WeatherReading {
        val current = JSONObject(body).getJSONObject("current")
        return WeatherReading(
            code = current.getInt("weather_code"),
            precipitation = current.optDouble("precipitation", 0.0).toFloat(),
            windKmh = current.optDouble("wind_speed_10m", 0.0).toFloat(),
            isDay = current.optInt("is_day", 1) == 1,
            latitude = latitude,
            longitude = longitude,
            fetchedAt = now,
        )
    }

    /** Même lieu (à environ 1 km près) : un relevé fait là reste valable. */
    fun samePlace(reading: WeatherReading, latitude: Double, longitude: Double): Boolean =
        abs(reading.latitude - latitude) < 0.01 && abs(reading.longitude - longitude) < 0.01

    /** Relevé utilisable pour le lieu choisi (le dernier connu, même ancien : hors ligne, il reste affiché). */
    fun usable(reading: WeatherReading?, settings: WeatherSettings): WeatherReading? {
        if (reading == null || settings.latitude == null || settings.longitude == null) return null
        return reading.takeIf { samePlace(it, settings.latitude, settings.longitude) }
    }

    /**
     * Faut-il relever la météo à [now] ? Pas si le relevé du lieu a moins de 30 min, ni si le dernier
     * essai ([attemptAt], 0 : aucun) date de moins de 10 min (échec, réseau absent).
     */
    fun shouldFetch(now: Long, reading: WeatherReading?, attemptAt: Long, latitude: Double, longitude: Double): Boolean {
        val fresh = reading != null && samePlace(reading, latitude, longitude) && now - reading.fetchedAt in 0 until REFRESH_MS
        if (fresh) return false
        return attemptAt <= 0L || now - attemptAt !in 0 until RETRY_MS
    }

    /** Délai avant le prochain relevé, la scène étant visible ([now] : maintenant). */
    fun nextCheckDelay(now: Long, reading: WeatherReading?, attemptAt: Long): Long {
        val dueRefresh = reading?.let { it.fetchedAt + REFRESH_MS - now } ?: 0L
        val dueRetry = if (attemptAt > 0L) attemptAt + RETRY_MS - now else 0L
        return max(max(dueRefresh, dueRetry), 60_000L).coerceAtMost(REFRESH_MS)
    }
}

/** Éclairs de l'orage : rares, brefs, un flash puis un second plus faible. */
object Lightning {
    const val DURATION_MS = 700L

    /** Attente avant l'éclair suivant : 6 à 18 s. */
    fun nextDelayMs(random: Random): Long = 6_000L + random.nextLong(12_000L)

    /** Intensité (0..1) du flash [elapsedMs] après le début de l'éclair. */
    fun flash(elapsedMs: Long): Float {
        if (elapsedMs < 0 || elapsedMs >= DURATION_MS) return 0f
        return max(pulse(elapsedMs, 0L, 50L, 180L, 0.42f), pulse(elapsedMs, 230L, 40L, 420L, 0.28f))
    }

    private fun pulse(t: Long, start: Long, rise: Long, fall: Long, peak: Float): Float {
        val dt = t - start
        return when {
            dt < 0 -> 0f
            dt < rise -> peak * dt / rise
            dt < rise + fall -> peak * (1f - (dt - rise).toFloat() / fall)
            else -> 0f
        }
    }
}
