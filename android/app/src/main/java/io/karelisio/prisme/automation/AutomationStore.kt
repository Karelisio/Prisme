package io.karelisio.prisme.automation

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar
import kotlin.math.abs

/** Configuration, état et journal des automatismes (SharedPreferences, accès synchronisés). */
internal class AutomationStore(context: Context) {
    private val prefs = context.getSharedPreferences("prisme_automation", Context.MODE_PRIVATE)

    fun configJson(): String? = prefs.getString(KEY_CONFIG, null)

    fun config(): AutomationConfig = AutomationConfig.parse(configJson())

    fun saveConfig(json: String) = synchronized(LOCK) { prefs.edit().putString(KEY_CONFIG, json).apply() }

    fun state(): AutomationState = synchronized(LOCK) {
        val raw = prefs.getString(KEY_STATE, null) ?: return AutomationState()
        runCatching {
            val json = JSONObject(raw)
            AutomationState(
                rotationIndex = json.optInt("rotationIndex", -1),
                lastRotationAt = json.optLong("lastRotationAt"),
                appliedHome = json.optString("appliedHome").ifBlank { null },
                appliedLock = json.optString("appliedLock").ifBlank { null },
                focusApplied = json.optBoolean("focusApplied"),
                dynamicApplied = json.optBoolean("dynamicApplied"),
                lastRunAt = json.optLong("lastRunAt"),
            )
        }.getOrDefault(AutomationState())
    }

    fun saveState(state: AutomationState) = synchronized(LOCK) {
        val json = JSONObject()
            .put("rotationIndex", state.rotationIndex)
            .put("lastRotationAt", state.lastRotationAt)
            .put("appliedHome", state.appliedHome ?: "")
            .put("appliedLock", state.appliedLock ?: "")
            .put("focusApplied", state.focusApplied)
            .put("dynamicApplied", state.dynamicApplied)
            .put("lastRunAt", state.lastRunAt)
        prefs.edit().putString(KEY_STATE, json.toString()).apply()
    }

    fun appendLog(entries: List<JSONObject>) = synchronized(LOCK) {
        if (entries.isEmpty()) return
        val log = readLog()
        entries.forEach(log::put)
        val trimmed = JSONArray()
        for (i in maxOf(0, log.length() - MAX_LOG) until log.length()) trimmed.put(log.get(i))
        prefs.edit().putString(KEY_LOG, trimmed.toString()).apply()
    }

    /** Renvoie puis efface le journal (l'app l'intègre à l'historique). */
    fun drainLog(): JSONArray = synchronized(LOCK) {
        val log = readLog()
        prefs.edit().remove(KEY_LOG).apply()
        log
    }

    private fun readLog(): JSONArray = runCatching { JSONArray(prefs.getString(KEY_LOG, "[]")) }.getOrDefault(JSONArray())

    fun cachedWeather(latitude: Double, longitude: Double, now: Long): WeatherCondition? = synchronized(LOCK) {
        val raw = prefs.getString(KEY_WEATHER, null) ?: return null
        val json = runCatching { JSONObject(raw) }.getOrNull() ?: return null
        val samePlace = abs(json.optDouble("lat") - latitude) < 0.05 && abs(json.optDouble("lon") - longitude) < 0.05
        if (!samePlace || now - json.optLong("at") > WEATHER_MAX_AGE_MS) return null
        WeatherCondition.fromKey(json.optString("condition"))
    }

    fun saveWeather(latitude: Double, longitude: Double, condition: WeatherCondition, now: Long) = synchronized(LOCK) {
        val json = JSONObject().put("lat", latitude).put("lon", longitude).put("condition", condition.key).put("at", now)
        prefs.edit().putString(KEY_WEATHER, json.toString()).apply()
    }

    companion object {
        private val LOCK = Any()
        private const val KEY_CONFIG = "config"
        private const val KEY_STATE = "state"
        private const val KEY_LOG = "log"
        private const val KEY_WEATHER = "weather"
        private const val MAX_LOG = 50
        const val WEATHER_MAX_AGE_MS = 30 * 60_000L

        fun now(): Moment = moment(Calendar.getInstance())

        /** Calendar (dimanche = 1) → Moment (lundi = 1). */
        fun moment(calendar: Calendar): Moment = Moment(
            epochMillis = calendar.timeInMillis,
            dayOfWeek = (calendar.get(Calendar.DAY_OF_WEEK) + 5) % 7 + 1,
            minuteOfDay = calendar.get(Calendar.HOUR_OF_DAY) * 60 + calendar.get(Calendar.MINUTE),
            month = calendar.get(Calendar.MONTH) + 1,
        )
    }
}
