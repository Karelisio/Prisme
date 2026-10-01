package io.karelisio.prisme.wallpaper

import android.content.Context
import org.json.JSONObject

/** Référence d'image applicable : URL distante ou fichier local, avec recadrage éventuel. */
data class WallpaperRef(val id: String, val uri: String, val crop: NormalizedRect? = null) {

    fun toJson(): JSONObject = JSONObject().apply {
        put("id", id)
        put("uri", uri)
        crop?.let {
            put("crop", JSONObject().put("x", it.x).put("y", it.y).put("width", it.width).put("height", it.height))
        }
    }

    companion object {
        fun fromJson(json: JSONObject?): WallpaperRef? {
            if (json == null) return null
            val uri = json.optString("uri").takeIf { it.isNotBlank() } ?: return null
            return WallpaperRef(json.optString("id").ifBlank { uri }, uri, cropFromJson(json.optJSONObject("crop")))
        }

        fun cropFromJson(json: JSONObject?): NormalizedRect? {
            if (json == null) return null
            val values = listOf("x", "y", "width", "height").map { json.optDouble(it, Double.NaN) }
            if (values.any { it.isNaN() }) return null
            return NormalizedRect(values[0], values[1], values[2], values[3])
        }
    }
}

/** Mémorise le dernier fond appliqué manuellement sur chaque écran (pour pouvoir le restaurer). */
internal class AppliedWallpapers(context: Context) {
    private val prefs = context.getSharedPreferences("prisme_applied", Context.MODE_PRIVATE)

    fun recordManual(target: WallpaperTarget, ref: WallpaperRef) {
        val json = ref.toJson().toString()
        prefs.edit().apply {
            if (target != WallpaperTarget.LOCK) putString(KEY_HOME, json)
            if (target != WallpaperTarget.HOME) putString(KEY_LOCK, json)
        }.apply()
    }

    fun lastManual(target: WallpaperTarget): WallpaperRef? {
        val raw = prefs.getString(if (target == WallpaperTarget.LOCK) KEY_LOCK else KEY_HOME, null) ?: return null
        return runCatching { WallpaperRef.fromJson(JSONObject(raw)) }.getOrNull()
    }

    private companion object {
        const val KEY_HOME = "manual_home"
        const val KEY_LOCK = "manual_lock"
    }
}
