package io.karelisio.prisme.live

import android.app.WallpaperManager
import android.content.ComponentName
import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import org.json.JSONException
import org.json.JSONObject

/**
 * Réglages du fond animé, partagés entre l'app et les services : genre ([LiveMode]) et réglages de chaque
 * scène, image et intensité de la parallaxe, liste « changer à chaque déverrouillage », pause en économie
 * de batterie, double-tap, et vidéo et GIF choisis dans la galerie.
 */
object LiveWallpaperStore {
    const val DEFAULT_INTENSITY = 0.5f
    private const val PREFS = "prisme_live"
    private const val KEY_PATH = "path"
    private const val KEY_INTENSITY = "intensity"
    private const val KEY_PLAYLIST_ENABLED = "playlist_enabled"
    private const val KEY_PLAYLIST = "playlist"
    private const val KEY_EVERY = "playlist_every"
    private const val KEY_INDEX = "playlist_index"
    private const val KEY_PLAYLIST_UNLOCK = "playlist_unlock"
    private const val SCENE_PREFIX = "scene_"

    /** Genre de fond : le service change de scène. */
    const val KEY_MODE = "mode"

    /** Pause en économie de batterie (activée par défaut). */
    const val KEY_ECO = "eco"

    /** Double-tap sur l'écran d'accueil : image suivante (lu au moment du toucher). */
    const val KEY_DOUBLE_TAP = "double_tap"

    /** Change à chaque déverrouillage : le service l'ignore, il n'y a rien à recharger. */
    const val KEY_COUNTER = "playlist_counter"

    /**
     * Vidéo et GIF choisis dans la galerie ([MediaInfo] en JSON), écrits une fois le fichier en place : les fonds
     * rechargent dessus. Clés à part des réglages de scène (`scene_*`), que l'app réécrit en entier.
     */
    const val KEY_MEDIA_VIDEO = "media_video"
    const val KEY_MEDIA_GIF = "media_gif"

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
        /** Les déverrouillages font changer l'image (sinon, la liste ne sert qu'au double-tap). */
        val unlock: Boolean = true,
    ) {
        /** Active seulement avec au moins deux images prêtes : sinon l'image ne peut pas changer. */
        val active: Boolean get() = enabled && paths.size >= 2
    }

    data class Config(
        val path: String?,
        val intensity: Float,
        val playlist: Playlist = Playlist(),
        val mode: LiveMode = LiveMode.IMAGE,
        val eco: Boolean = true,
        val doubleTap: Boolean = false,
    ) {
        /** Image à afficher : celle de la liste en cours, sinon l'image choisie dans l'app. */
        val shownPath: String? get() = (if (playlist.active) playlist.paths.getOrNull(playlist.index) else null) ?: path
    }

    fun prefs(context: Context): SharedPreferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun read(context: Context): Config {
        val prefs = prefs(context)
        return Config(
            path = prefs.getString(KEY_PATH, null),
            intensity = prefs.getFloat(KEY_INTENSITY, DEFAULT_INTENSITY),
            playlist = readPlaylist(prefs),
            mode = LiveMode.fromKey(prefs.getString(KEY_MODE, null)),
            eco = prefs.getBoolean(KEY_ECO, true),
            doubleTap = prefs.getBoolean(KEY_DOUBLE_TAP, false),
        )
    }

    /** Genre de fond et options communes ; les réglages propres au genre vont dans [saveSceneSettings]. */
    fun configure(context: Context, mode: LiveMode, eco: Boolean, doubleTap: Boolean) {
        prefs(context).edit {
            putString(KEY_MODE, mode.key)
            putBoolean(KEY_ECO, eco)
            putBoolean(KEY_DOUBLE_TAP, doubleTap)
        }
    }

    /** Réglages d'une scène (objet JSON propre à chaque genre), relus par la scène quand ils changent. */
    fun sceneSettings(context: Context, mode: LiveMode): JSONObject {
        val raw = prefs(context).getString(SCENE_PREFIX + mode.key, null) ?: return JSONObject()
        return try {
            JSONObject(raw)
        } catch (e: JSONException) {
            JSONObject()
        }
    }

    fun saveSceneSettings(context: Context, mode: LiveMode, settings: JSONObject) {
        val raw = settings.toString()
        val prefs = prefs(context)
        if (prefs.getString(SCENE_PREFIX + mode.key, null) != raw) prefs.edit { putString(SCENE_PREFIX + mode.key, raw) }
    }

    /** Clé de préférences des réglages de la scène [mode] (le service ne prévient que la scène concernée). */
    fun sceneKey(mode: LiveMode) = SCENE_PREFIX + mode.key

    fun mediaKey(kind: MediaKind): String = when (kind) {
        MediaKind.VIDEO -> KEY_MEDIA_VIDEO
        MediaKind.GIF -> KEY_MEDIA_GIF
    }

    /** Média choisi de ce genre (sans vérifier que son fichier existe : voir [LiveMedia.ready]). */
    fun media(context: Context, kind: MediaKind): MediaInfo? = MediaInfo.fromJson(prefs(context).getString(mediaKey(kind), null))

    fun saveMedia(context: Context, kind: MediaKind, info: MediaInfo) {
        prefs(context).edit { putString(mediaKey(kind), info.toJson()) }
    }

    private fun readPlaylist(prefs: SharedPreferences) = Playlist(
        enabled = prefs.getBoolean(KEY_PLAYLIST_ENABLED, false),
        paths = UnlockPlaylist.decodePaths(prefs.getString(KEY_PLAYLIST, null)),
        every = UnlockPlaylist.clampEvery(prefs.getInt(KEY_EVERY, UnlockPlaylist.DEFAULT_EVERY)),
        index = prefs.getInt(KEY_INDEX, -1),
        counter = prefs.getInt(KEY_COUNTER, 0),
        unlock = prefs.getBoolean(KEY_PLAYLIST_UNLOCK, true),
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
    fun savePlaylist(context: Context, enabled: Boolean, every: Int, paths: List<String>, unlock: Boolean = true) {
        val prefs = prefs(context)
        val before = readPlaylist(prefs)
        prefs.edit {
            putBoolean(KEY_PLAYLIST_ENABLED, enabled)
            putInt(KEY_EVERY, UnlockPlaylist.clampEvery(every))
            putString(KEY_PLAYLIST, UnlockPlaylist.encodePaths(paths))
            putBoolean(KEY_PLAYLIST_UNLOCK, unlock)
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

    /** Service des scènes (photo, GIF, dégradés…). */
    fun component(context: Context): ComponentName = ComponentName(context, ParallaxWallpaperService::class.java)

    /** Service de la vidéo. */
    fun videoComponent(context: Context): ComponentName = ComponentName(context, VideoWallpaperService::class.java)

    fun component(context: Context, which: LiveComponent): ComponentName = when (which) {
        LiveComponent.SCENES -> component(context)
        LiveComponent.VIDEO -> videoComponent(context)
    }

    /** Fond animé Prisme actif sur Android en ce moment (celui des scènes ou celui de la vidéo), ou null. */
    fun activeComponent(context: Context): LiveComponent? {
        val active = WallpaperManager.getInstance(context).wallpaperInfo?.component ?: return null
        return if (active.packageName == context.packageName) LiveComponent.ofService(active.className) else null
    }

    /** L'un des deux fonds animés Prisme est actif. */
    fun isActive(context: Context): Boolean = activeComponent(context) != null

    fun isActive(context: Context, which: LiveComponent): Boolean = activeComponent(context) == which
}
