package io.karelisio.prisme.automation

import io.karelisio.prisme.wallpaper.WallpaperRef
import io.karelisio.prisme.wallpaper.WallpaperTarget
import org.json.JSONArray
import org.json.JSONObject

enum class WeatherCondition(val key: String) {
    CLEAR("clear"),
    CLOUDY("cloudy"),
    FOG("fog"),
    RAIN("rain"),
    SNOW("snow"),
    STORM("storm"),
    NIGHT("night");

    companion object {
        fun fromKey(key: String) = entries.firstOrNull { it.key == key }
    }
}

enum class Season(val key: String) {
    SPRING("spring"),
    SUMMER("summer"),
    AUTUMN("autumn"),
    WINTER("winter");

    companion object {
        fun fromKey(key: String) = entries.firstOrNull { it.key == key }
    }
}

data class TimeSlot(val startMinute: Int, val ref: WallpaperRef)

/** Plage de batterie [min, max[ en pourcentage. */
data class BatteryLevel(val min: Int, val max: Int, val ref: WallpaperRef)

/** Plage du mode focus : jours 1 (lundi) à 7 (dimanche), minutes depuis minuit ; fin < début = nuit à cheval. */
data class FocusSchedule(val days: Set<Int>, val startMinute: Int, val endMinute: Int)

sealed interface DynamicMode {
    data class Time(val slots: List<TimeSlot>) : DynamicMode
    data class Weather(val latitude: Double, val longitude: Double, val items: Map<WeatherCondition, WallpaperRef>) : DynamicMode
    data class Seasons(val southern: Boolean, val items: Map<Season, WallpaperRef>) : DynamicMode
    data class Battery(val levels: List<BatteryLevel>, val charging: WallpaperRef?) : DynamicMode
}

data class RotationConfig(
    val enabled: Boolean = false,
    val intervalMinutes: Int = 60,
    val target: WallpaperTarget = WallpaperTarget.BOTH,
    val shuffle: Boolean = true,
    val items: List<WallpaperRef> = emptyList(),
    /** Fonds pris au hasard en ligne (remplace [items]). */
    val online: OnlineConfig? = null,
) {
    val active: Boolean
        get() = enabled && (online != null || items.isNotEmpty())
}

data class DynamicConfig(
    val enabled: Boolean = false,
    val target: WallpaperTarget = WallpaperTarget.BOTH,
    val mode: DynamicMode? = null,
)

data class FocusConfig(
    val enabled: Boolean = false,
    val target: WallpaperTarget = WallpaperTarget.BOTH,
    val ref: WallpaperRef? = null,
    val schedules: List<FocusSchedule> = emptyList(),
)

/** Zone circulaire (rayon en mètres) dont le fond remplace le fond habituel quand l'appareil s'y trouve. */
data class PlaceConfig(val name: String, val latitude: Double, val longitude: Double, val radius: Double, val ref: WallpaperRef) {
    /** Identité du lieu pour la mémoire des allées et venues : le rayon et le fond peuvent changer sans qu'on le « quitte ». */
    val key: String
        get() = "$name|$latitude|$longitude"
}

data class PlacesConfig(
    val enabled: Boolean = false,
    val target: WallpaperTarget = WallpaperTarget.BOTH,
    val items: List<PlaceConfig> = emptyList(),
) {
    val active: Boolean
        get() = enabled && items.isNotEmpty()
}

/** Configuration envoyée par l'app ; le moteur l'évalue en tâche de fond, app fermée. */
data class AutomationConfig(
    val rotation: RotationConfig = RotationConfig(),
    val dynamic: DynamicConfig = DynamicConfig(),
    val places: PlacesConfig = PlacesConfig(),
    val focus: FocusConfig = FocusConfig(),
) {
    val anyEnabled: Boolean
        get() = rotation.active || places.active ||
            (dynamic.enabled && dynamic.mode != null) ||
            (focus.enabled && focus.ref != null && focus.schedules.isNotEmpty())

    /**
     * Ce qui, s'il change, impose de réappliquer le fond tout de suite (activation, mode, écran visé).
     * Un simple changement d'images est géré par le moteur, qui compare les identifiants.
     */
    fun signature(): String = listOf(
        rotation.enabled, rotation.target, rotation.online?.key,
        dynamic.enabled, dynamic.target, dynamic.mode?.javaClass?.simpleName,
        places.enabled, places.target,
        focus.enabled, focus.target,
    ).joinToString("|")

    /** Toutes les images utilisées, pour les télécharger à l'avance et nettoyer les autres. */
    fun refs(): List<WallpaperRef> {
        val out = mutableListOf<WallpaperRef>()
        out += rotation.items
        when (val mode = dynamic.mode) {
            is DynamicMode.Time -> out += mode.slots.map { it.ref }
            is DynamicMode.Weather -> out += mode.items.values
            is DynamicMode.Seasons -> out += mode.items.values
            is DynamicMode.Battery -> {
                out += mode.levels.map { it.ref }
                mode.charging?.let { out += it }
            }
            null -> Unit
        }
        out += places.items.map { it.ref }
        focus.ref?.let { out += it }
        return out
    }

    companion object {
        /** Rayon par défaut et rayon minimal d'un lieu, en mètres : en dessous, la précision de la position ne suffit plus à trancher. */
        private const val DEFAULT_PLACE_RADIUS = 300.0
        private const val MIN_PLACE_RADIUS = 50.0

        fun parse(raw: String?): AutomationConfig {
            if (raw.isNullOrBlank()) return AutomationConfig()
            return runCatching { fromJson(JSONObject(raw)) }.getOrDefault(AutomationConfig())
        }

        fun fromJson(json: JSONObject): AutomationConfig = AutomationConfig(
            rotation = json.optJSONObject("rotation")?.let(::rotation) ?: RotationConfig(),
            dynamic = json.optJSONObject("dynamic")?.let(::dynamic) ?: DynamicConfig(),
            places = json.optJSONObject("places")?.let(::places) ?: PlacesConfig(),
            focus = json.optJSONObject("focus")?.let(::focus) ?: FocusConfig(),
        )

        private fun target(json: JSONObject) = WallpaperTarget.fromKey(json.optString("target")) ?: WallpaperTarget.BOTH

        private fun rotation(json: JSONObject) = RotationConfig(
            enabled = json.optBoolean("enabled"),
            intervalMinutes = json.optInt("intervalMinutes", 60).coerceAtLeast(15),
            target = target(json),
            shuffle = json.optBoolean("shuffle", true),
            items = refs(json.optJSONArray("items")),
            online = OnlineConfig.fromJson(json.optJSONObject("online")),
        )

        private fun dynamic(json: JSONObject) = DynamicConfig(
            enabled = json.optBoolean("enabled"),
            target = target(json),
            mode = when (json.optString("mode")) {
                "time" -> json.optJSONObject("time")?.let { t ->
                    DynamicMode.Time(
                        objects(t.optJSONArray("slots")).mapNotNull { slot ->
                            val ref = WallpaperRef.fromJson(slot.optJSONObject("item")) ?: return@mapNotNull null
                            parseMinute(slot.optString("start"))?.let { TimeSlot(it, ref) }
                        },
                    ).takeIf { it.slots.isNotEmpty() }
                }
                "weather" -> json.optJSONObject("weather")?.let { w ->
                    val items = refMap(w.optJSONObject("items")) { WeatherCondition.fromKey(it) }
                    if (items.isEmpty() || !w.has("latitude") || !w.has("longitude")) null
                    else DynamicMode.Weather(w.optDouble("latitude"), w.optDouble("longitude"), items)
                }
                "season" -> json.optJSONObject("season")?.let { s ->
                    val items = refMap(s.optJSONObject("items")) { Season.fromKey(it) }
                    if (items.isEmpty()) null else DynamicMode.Seasons(s.optString("hemisphere") == "south", items)
                }
                "battery" -> json.optJSONObject("battery")?.let { b ->
                    val levels = objects(b.optJSONArray("levels")).mapNotNull { level ->
                        WallpaperRef.fromJson(level.optJSONObject("item"))?.let {
                            BatteryLevel(level.optInt("min").coerceIn(0, 100), level.optInt("max", 101).coerceIn(1, 101), it)
                        }
                    }
                    val charging = WallpaperRef.fromJson(b.optJSONObject("charging"))
                    if (levels.isEmpty() && charging == null) null else DynamicMode.Battery(levels, charging)
                }
                else -> null
            },
        )

        private fun places(json: JSONObject) = PlacesConfig(
            enabled = json.optBoolean("enabled"),
            target = target(json),
            items = objects(json.optJSONArray("items")).mapNotNull { place ->
                val ref = WallpaperRef.fromJson(place.optJSONObject("item")) ?: return@mapNotNull null
                val latitude = place.optDouble("latitude")
                val longitude = place.optDouble("longitude")
                // Coordonnées absentes ou hors du globe (NaN compris) : lieu ignoré.
                if (latitude !in -90.0..90.0 || longitude !in -180.0..180.0) return@mapNotNull null
                val radius = place.optDouble("radius", DEFAULT_PLACE_RADIUS).coerceAtLeast(MIN_PLACE_RADIUS)
                PlaceConfig(place.optString("name"), latitude, longitude, radius, ref)
            },
        )

        private fun focus(json: JSONObject) = FocusConfig(
            enabled = json.optBoolean("enabled"),
            target = target(json),
            ref = WallpaperRef.fromJson(json.optJSONObject("item")),
            schedules = objects(json.optJSONArray("schedules")).mapNotNull { s ->
                val start = parseMinute(s.optString("start")) ?: return@mapNotNull null
                val end = parseMinute(s.optString("end")) ?: return@mapNotNull null
                val days = (0 until (s.optJSONArray("days")?.length() ?: 0)).map { s.getJSONArray("days").optInt(it) }.filter { it in 1..7 }.toSet()
                if (days.isEmpty()) null else FocusSchedule(days, start, end)
            },
        )

        /** "HH:mm" → minutes depuis minuit. */
        fun parseMinute(value: String): Int? {
            val parts = value.split(':')
            if (parts.size != 2) return null
            val h = parts[0].toIntOrNull() ?: return null
            val m = parts[1].toIntOrNull() ?: return null
            if (h !in 0..23 || m !in 0..59) return null
            return h * 60 + m
        }

        private fun objects(array: JSONArray?): List<JSONObject> =
            if (array == null) emptyList() else (0 until array.length()).mapNotNull { array.optJSONObject(it) }

        private fun refs(array: JSONArray?): List<WallpaperRef> = objects(array).mapNotNull { WallpaperRef.fromJson(it) }

        private fun <K> refMap(json: JSONObject?, key: (String) -> K?): Map<K, WallpaperRef> {
            if (json == null) return emptyMap()
            val out = mutableMapOf<K, WallpaperRef>()
            for (name in json.keys()) {
                val k = key(name) ?: continue
                WallpaperRef.fromJson(json.optJSONObject(name))?.let { out[k] = it }
            }
            return out
        }
    }
}
