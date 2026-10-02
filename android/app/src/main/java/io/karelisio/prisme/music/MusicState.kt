package io.karelisio.prisme.music

import android.content.Context
import androidx.core.content.edit
import io.karelisio.prisme.wallpaper.WallpaperTarget

/**
 * Réglages envoyés par l'app et état de l'affichage, dans des SharedPreferences dédiées : le service
 * d'écoute, le plugin et les automatismes les lisent, y compris app fermée.
 */
internal class MusicState(context: Context) {
    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    var enabled: Boolean
        get() = prefs.getBoolean(KEY_ENABLED, false)
        set(value) = prefs.edit { putBoolean(KEY_ENABLED, value) }

    /** Écran qui reçoit la pochette. */
    var target: WallpaperTarget
        get() = WallpaperTarget.fromKey(prefs.getString(KEY_TARGET, null)) ?: WallpaperTarget.BOTH
        set(value) = prefs.edit { putString(KEY_TARGET, value.key) }

    /** Rendre le fond précédent quand la musique s'arrête. */
    var restore: Boolean
        get() = prefs.getBoolean(KEY_RESTORE, true)
        set(value) = prefs.edit { putBoolean(KEY_RESTORE, value) }

    /** Une pochette est posée en fond d'écran : les automatismes ne doivent pas l'écraser. */
    var showing: Boolean
        get() = prefs.getBoolean(KEY_SHOWING, false)
        set(value) = prefs.edit { putBoolean(KEY_SHOWING, value) }

    /** Clé du morceau dont la pochette est affichée. */
    var lastKey: String?
        get() = prefs.getString(KEY_LAST_KEY, null)
        set(value) = prefs.edit { putString(KEY_LAST_KEY, value) }

    /** Écrans touchés depuis le début de l'affichage (l'écran visé a pu changer entre-temps). */
    val touched: WallpaperTarget?
        get() = WallpaperTarget.fromKey(prefs.getString(KEY_TOUCHED, null))

    /** Heure à laquelle la lecture s'est arrêtée (0 : elle joue) ; gardée pour survivre à un redémarrage du processus. */
    var pausedSince: Long
        get() = prefs.getLong(KEY_PAUSED_SINCE, 0L)
        set(value) = prefs.edit { putLong(KEY_PAUSED_SINCE, value) }

    fun configure(enabled: Boolean, target: WallpaperTarget, restore: Boolean) = prefs.edit {
        putBoolean(KEY_ENABLED, enabled)
        putString(KEY_TARGET, target.key)
        putBoolean(KEY_RESTORE, restore)
    }

    /** La pochette [key] est posée sur [target] (en plus des écrans déjà touchés). */
    fun markShown(key: String, target: WallpaperTarget) {
        val screens = MusicRules.touched(touched, target)
        prefs.edit {
            putBoolean(KEY_SHOWING, true)
            putString(KEY_LAST_KEY, key)
            putString(KEY_TOUCHED, screens.key)
            putLong(KEY_PAUSED_SINCE, 0L)
        }
    }

    /** Plus de pochette affichée : les automatismes reprennent la main, et le même morceau pourra la reposer. */
    fun markEnded() = prefs.edit {
        putBoolean(KEY_SHOWING, false)
        remove(KEY_LAST_KEY)
        remove(KEY_TOUCHED)
        putLong(KEY_PAUSED_SINCE, 0L)
    }

    private companion object {
        const val PREFS = "prisme_music"
        const val KEY_ENABLED = "enabled"
        const val KEY_TARGET = "target"
        const val KEY_RESTORE = "restore"
        const val KEY_SHOWING = "showing"
        const val KEY_LAST_KEY = "lastKey"
        const val KEY_TOUCHED = "touched"
        const val KEY_PAUSED_SINCE = "pausedSince"
    }
}
