package io.karelisio.prisme.quick

import android.content.Context
import androidx.core.content.edit
import io.karelisio.prisme.automation.AutomationConfig
import io.karelisio.prisme.automation.Moment
import io.karelisio.prisme.automation.RulesEngine
import io.karelisio.prisme.wallpaper.WallpaperRef
import io.karelisio.prisme.wallpaper.WallpaperTarget
import org.json.JSONObject
import kotlin.random.Random

/** Favoris envoyés par l'app pour « Fond suivant » et « Favori au hasard » (tuile, raccourcis). */
internal class QuickPool(context: Context) {
    private val prefs = context.getSharedPreferences("prisme_quick", Context.MODE_PRIVATE)

    data class Pool(val target: WallpaperTarget = WallpaperTarget.BOTH, val items: List<WallpaperRef> = emptyList())

    fun save(json: String) = prefs.edit { putString(KEY_POOL, json) }

    fun load(): Pool = parse(prefs.getString(KEY_POOL, null))

    var lastId: String?
        get() = prefs.getString(KEY_LAST, null)
        set(value) = prefs.edit { putString(KEY_LAST, value) }

    companion object {
        private const val KEY_POOL = "pool"
        private const val KEY_LAST = "last"

        fun parse(raw: String?): Pool {
            if (raw.isNullOrBlank()) return Pool()
            val json = runCatching { JSONObject(raw) }.getOrNull() ?: return Pool()
            val array = json.optJSONArray("items")
            val items = if (array == null) emptyList() else (0 until array.length()).mapNotNull { WallpaperRef.fromJson(array.optJSONObject(it)) }
            return Pool(WallpaperTarget.fromKey(json.optString("target")) ?: WallpaperTarget.BOTH, items)
        }

        /** Tirage au hasard en évitant de reprendre le fond actuel quand c'est possible. */
        fun pick(items: List<WallpaperRef>, lastId: String?, random: Random): WallpaperRef? {
            if (items.isEmpty()) return null
            val candidates = items.filter { it.id != lastId }.ifEmpty { items }
            return candidates[random.nextInt(candidates.size)]
        }

        /**
         * « Fond suivant » fait avancer la rotation quand elle est active et qu'aucun automatisme
         * prioritaire (mode focus en cours, fonds dynamiques) ne décide du fond ; sinon, favori au hasard.
         */
        fun rotationDrivesNext(config: AutomationConfig, moment: Moment): Boolean {
            if (!config.rotation.active) return false
            val focus = config.focus
            if (focus.enabled && focus.ref != null && RulesEngine.focusActive(focus, moment)) return false
            return !(config.dynamic.enabled && config.dynamic.mode != null)
        }
    }
}
