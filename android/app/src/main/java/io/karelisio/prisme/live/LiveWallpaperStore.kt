package io.karelisio.prisme.live

import android.app.WallpaperManager
import android.content.ComponentName
import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit

/** Image, intensité et liste « changer à chaque déverrouillage » du fond animé, partagées entre l'app et le service. */
object LiveWallpaperStore {
    const val DEFAULT_INTENSITY = 0.5f
    private const val PREFS = "prisme_live"
    private const val KEY_PATH = "path"
    private const val KEY_INTENSITY = "intensity"
    private const val KEY_PLAYLIST_ENABLED = "playlist_enabled"
    private const val KEY_PLAYLIST = "playlist"
    private const val KEY_EVERY = "playlist_every"
    private const val KEY_INDEX = "playlist_index"

    /** Change à chaque déverrouillage : le service l'ignore, il n'y a rien à recharger. */
    const val KEY_COUNTER = "playlist_counter"

    /**
     * Changement à chaque déverrouillage : images déjà préparées (chemins), fréquence, image affichée
     * ([index] dans [paths], -1 pour l'image choisie dans l'app) et déverrouillages comptés depuis le
     * dernier changement.
     */
    data class Playlist(
        val enabled: Boolean = false,
        val paths: List<String> = emptyList(),
        val every: Int = UnlockPlaylist.DEFAULT_EVERY,
        val index: Int = -1,
        val counter: Int = 0,
    ) {
        /** Active seulement avec au moins deux images prêtes : sinon l'image ne peut pas changer. */
        val active: Boolean get() = enabled && paths.size >= 2
    }

    data class Config(val path: String?, val intensity: Float, val playlist: Playlist = Playlist()) {
        /** Image à afficher : celle de la liste en cours, sinon l'image choisie dans l'app. */
        val shownPath: String? get() = (if (playlist.active) playlist.paths.getOrNull(playlist.index) else null) ?: path
    }

    fun prefs(context: Context): SharedPreferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun read(context: Context): Config {
        val prefs = prefs(context)
        return Config(prefs.getString(KEY_PATH, null), prefs.getFloat(KEY_INTENSITY, DEFAULT_INTENSITY), readPlaylist(prefs))
    }

    private fun readPlaylist(prefs: SharedPreferences) = Playlist(
        enabled = prefs.getBoolean(KEY_PLAYLIST_ENABLED, false),
        paths = UnlockPlaylist.decodePaths(prefs.getString(KEY_PLAYLIST, null)),
        every = UnlockPlaylist.clampEvery(prefs.getInt(KEY_EVERY, UnlockPlaylist.DEFAULT_EVERY)),
        index = prefs.getInt(KEY_INDEX, -1),
        counter = prefs.getInt(KEY_COUNTER, 0),
    )

    /** Nouvelle image choisie : elle s'affiche tout de suite, la liste repart d'elle. */
    fun write(context: Context, path: String, intensity: Float) {
        prefs(context).edit {
            putString(KEY_PATH, path)
            putFloat(KEY_INTENSITY, intensity.coerceIn(0f, 1f))
            putInt(KEY_INDEX, -1)
            putInt(KEY_COUNTER, 0)
        }
    }

    /**
     * Enregistre la liste d'images prêtes. L'image affichée est retrouvée par son chemin ; le compteur
     * repart de zéro à l'activation. Une seule écriture : le service voit toujours un état cohérent.
     */
    fun savePlaylist(context: Context, enabled: Boolean, every: Int, paths: List<String>) {
        val prefs = prefs(context)
        val before = readPlaylist(prefs)
        prefs.edit {
            putBoolean(KEY_PLAYLIST_ENABLED, enabled)
            putInt(KEY_EVERY, UnlockPlaylist.clampEvery(every))
            putString(KEY_PLAYLIST, UnlockPlaylist.encodePaths(paths))
            putInt(KEY_INDEX, UnlockPlaylist.remapIndex(before.paths, before.index, paths))
            if (!(enabled && before.enabled)) putInt(KEY_COUNTER, 0)
        }
    }

    fun saveCounter(context: Context, counter: Int) {
        prefs(context).edit { putInt(KEY_COUNTER, counter) }
    }

    /** Image suivante choisie : compteur remis à zéro. */
    fun saveChange(context: Context, index: Int) {
        prefs(context).edit {
            putInt(KEY_INDEX, index)
            putInt(KEY_COUNTER, 0)
        }
    }

    fun component(context: Context) = ComponentName(context, ParallaxWallpaperService::class.java)

    fun isActive(context: Context): Boolean =
        WallpaperManager.getInstance(context).wallpaperInfo?.component == component(context)
}
