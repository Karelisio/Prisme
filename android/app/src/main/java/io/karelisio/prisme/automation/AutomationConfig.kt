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

/** Repère solaire d'un créneau « suivre le soleil ». */
enum class SunAnchor(val key: String) {
    SUNRISE("sunrise"),
    SUNSET("sunset");

    companion object {
        fun fromKey(key: String) = entries.firstOrNull { it.key == key }
    }
}

/** Créneau horaire ; avec [anchor], il commence à [offsetMinutes] du lever ou du coucher du soleil. */
data class TimeSlot(val startMinute: Int, val ref: WallpaperRef, val anchor: SunAnchor? = null, val offsetMinutes: Int = 0)

/** Plage de batterie [min, max[ en pourcentage. */
data class BatteryLevel(val min: Int, val max: Int, val ref: WallpaperRef)

/** Plage du mode focus : jours 1 (lundi) à 7 (dimanche), minutes depuis minuit ; fin < début = nuit à cheval. */
data class FocusSchedule(val days: Set<Int>, val startMinute: Int, val endMinute: Int)

sealed interface DynamicMode {
    /** [sun] : lieu dont le soleil cale les créneaux ancrés (sinon heures fixes). */
    data class Time(val slots: List<TimeSlot>, val sun: GeoPoint? = null) : DynamicMode {
        /** Créneaux du jour : heures fixes, ou recalculées d'après le soleil de [moment]. */
        fun resolved(moment: Moment): Time {
            val point = sun ?: return this
            val times = SunTimes.compute(point, moment) ?: return this
            return copy(
                slots = slots.map { slot ->
                    when (slot.anchor) {
                        SunAnchor.SUNRISE -> slot.copy(startMinute = (times.sunrise + slot.offsetMinutes).mod(24 * 60))
                        SunAnchor.SUNSET -> slot.copy(startMinute = (times.sunset + slot.offsetMinutes).mod(24 * 60))
                        null -> slot
                    }
                },
            )
        }
    }
    data class Weather(val latitude: Double, val longitude: Double, val items: Map<WeatherCondition, WallpaperRef>) : DynamicMode
    data class Seasons(val southern: Boolean, val items: Map<Season, WallpaperRef>) : DynamicMode
    data class Battery(val levels: List<BatteryLevel>, val charging: WallpaperRef?) : DynamicMode

    /** Suit le mode sombre du système : un fond clair, un fond sombre. */
    data class Theme(val light: WallpaperRef?, val dark: WallpaperRef?) : DynamicMode
}

data class RotationConfig(
    val enabled: Boolean = false,
    val intervalMinutes: Int = 60,
    val target: WallpaperTarget = WallpaperTarget.BOTH,
    val shuffle: Boolean = true,
    val items: List<WallpaperRef> = emptyList(),
    /** Fonds pris au hasard en ligne (remplace [items]). */
    val online: OnlineConfig? = null,
    /** Pas de répétition avant d'avoir tout vu, teintes variées, fonds sombres la nuit. */
    val smart: Boolean = false,
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

/** Configuration envoyée par l'app ; le moteur l'évalue en tâche de fond, app fermée. */
data class AutomationConfig(
    val rotation: RotationConfig = RotationConfig(),
    val dynamic: DynamicConfig = DynamicConfig(),
    val focus: FocusConfig = FocusConfig(),
    val events: EventsConfig = EventsConfig(),
    val dim: DimConfig = DimConfig(),
) {
    val anyEnabled: Boolean
        get() = rotation.active ||
            (events.enabled && events.items.isNotEmpty()) ||
            dim.enabled ||
            (dynamic.enabled && dynamic.mode != null) ||
            (focus.enabled && focus.ref != null && focus.schedules.isNotEmpty())

    /**
     * Ce qui, s'il change, impose de réappliquer le fond tout de suite (activation, mode, écran visé).
     * Un simple changement d'images est géré par le moteur, qui compare les identifiants.
     */
    fun signature(): String = listOf(
        rotation.enabled, rotation.target, rotation.online?.key, events.enabled, events.target, dim.enabled,
        dynamic.enabled, dynamic.target, dynamic.mode?.javaClass?.simpleName,
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
            is DynamicMode.Theme -> out += listOfNotNull(mode.light, mode.dark)
            null -> Unit
        }
        focus.ref?.let { out += it }
        out += events.items.mapNotNull { it.ref }
        return out
    }

    /** Lieu connu pour situer le soleil (assombrissement, créneaux, météo), sinon null. */
    fun sunPoint(): GeoPoint? = dim.sun
        ?: (dynamic.mode as? DynamicMode.Time)?.sun
        ?: (dynamic.mode as? DynamicMode.Weather)?.let { GeoPoint(it.latitude, it.longitude) }

    /** Requêtes en ligne (rotation, fêtes) : clé Unsplash pour le suivi des téléchargements. */
    fun onlineQueries(): List<OnlineQuery> = rotation.online?.queries.orEmpty() + events.items.flatMap { it.queries }

    companion object {
        fun parse(raw: String?): AutomationConfig {
            if (raw.isNullOrBlank()) return AutomationConfig()
            return runCatching { fromJson(JSONObject(raw)) }.getOrDefault(AutomationConfig())
        }

        fun fromJson(json: JSONObject): AutomationConfig = AutomationConfig(
            rotation = json.optJSONObject("rotation")?.let(::rotation) ?: RotationConfig(),
            dynamic = json.optJSONObject("dynamic")?.let(::dynamic) ?: DynamicConfig(),
            focus = json.optJSONObject("focus")?.let(::focus) ?: FocusConfig(),
            events = EventsConfig.fromJson(json.optJSONObject("events")),
            dim = DimConfig.fromJson(json.optJSONObject("dim")),
        )

        private fun target(json: JSONObject) = WallpaperTarget.fromKey(json.optString("target")) ?: WallpaperTarget.BOTH

        private fun rotation(json: JSONObject) = RotationConfig(
            enabled = json.optBoolean("enabled"),
            intervalMinutes = json.optInt("intervalMinutes", 60).coerceAtLeast(15),
            target = target(json),
            shuffle = json.optBoolean("shuffle", true),
            items = refs(json.optJSONArray("items")),
            online = OnlineConfig.fromJson(json.optJSONObject("online")),
            smart = json.optBoolean("smart"),
        )

        private fun dynamic(json: JSONObject) = DynamicConfig(
            enabled = json.optBoolean("enabled"),
            target = target(json),
            mode = when (json.optString("mode")) {
                "time" -> json.optJSONObject("time")?.let { t ->
                    DynamicMode.Time(
                        objects(t.optJSONArray("slots")).mapNotNull { slot ->
                            val ref = WallpaperRef.fromJson(slot.optJSONObject("item")) ?: return@mapNotNull null
                            parseMinute(slot.optString("start"))?.let {
                                TimeSlot(it, ref, SunAnchor.fromKey(slot.optString("anchor")), slot.optInt("offset"))
                            }
                        },
                        sun = t.optJSONObject("sun")?.let(::point),
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
                "theme" -> json.optJSONObject("theme")?.let { t ->
                    val light = WallpaperRef.fromJson(t.optJSONObject("light"))
                    val dark = WallpaperRef.fromJson(t.optJSONObject("dark"))
                    if (light == null && dark == null) null else DynamicMode.Theme(light, dark)
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

        private fun point(json: JSONObject): GeoPoint? {
            if (!json.has("latitude") || !json.has("longitude")) return null
            return GeoPoint(json.optDouble("latitude"), json.optDouble("longitude"))
        }

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
