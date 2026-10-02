package io.karelisio.prisme.live

import android.content.Context
import io.karelisio.prisme.wallpaper.CacheKeys
import io.karelisio.prisme.wallpaper.ScreenInfo
import io.karelisio.prisme.wallpaper.WallpaperRef
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.io.File

/**
 * Prépare en arrière-plan les images du changement à chaque déverrouillage, dans files/live-playlist :
 * téléchargées si besoin puis recadrées comme celle du fond animé, pour changer sans réseau et sans
 * attendre. Une nouvelle demande remplace la précédente ; les images déjà prêtes sont reprises, celles
 * qui ne servent plus supprimées et une image impossible à préparer est ignorée.
 */
internal object LivePlaylist {
    private const val DIR = "live-playlist"

    /** Marge maximale : une image préparée ainsi convient à toute intensité (le service la réduit au besoin). */
    private const val PREPARE_INTENSITY = 1f

    private class Target(val ref: WallpaperRef, val file: File) {
        val ready: Boolean get() = file.isFile && file.length() > 0
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /** Un seul travail à la fois : un nouveau attend la fin de l'image en cours du précédent. */
    private val queue = Mutex()
    private val lock = Any()

    /** Numéro de la dernière demande : un travail dépassé s'arrête sans rien publier ni supprimer. */
    @Volatile
    private var generation = 0

    /**
     * Enregistre la demande et lance la préparation ; renvoie le nombre d'images déjà prêtes. Sans
     * [enabled], la liste est vidée et ses fichiers supprimés.
     */
    fun update(context: Context, enabled: Boolean, every: Int, items: List<WallpaperRef>): Int {
        val app = context.applicationContext
        val dir = File(app.filesDir, DIR)
        val targets = if (enabled) UnlockPlaylist.select(items).map { Target(it, File(dir, "${CacheKeys.of(it.id)}.jpg")) } else emptyList()
        val ready: Int
        val request: Int
        synchronized(lock) {
            request = ++generation
            val paths = readyPaths(targets)
            LiveWallpaperStore.savePlaylist(app, enabled, every, paths)
            ready = paths.size
        }
        scope.launch { queue.withLock { prepare(app, request, every, targets) } }
        return ready
    }

    private fun prepare(app: Context, request: Int, every: Int, targets: List<Target>) {
        if (targets.isNotEmpty()) {
            val images = LiveImages(app)
            val screen = ScreenInfo.read(app, null)
            for (target in targets) {
                if (request != generation) return
                if (target.ready) continue
                try {
                    images.prepareTo(target.ref.uri, PREPARE_INTENSITY, null, screen, target.file)
                } catch (e: Exception) {
                    continue
                } catch (e: OutOfMemoryError) {
                    continue
                }
                // Publiée au fur et à mesure : le changement fonctionne dès que deux images sont prêtes.
                synchronized(lock) {
                    if (request == generation) LiveWallpaperStore.savePlaylist(app, true, every, readyPaths(targets))
                }
            }
        }
        synchronized(lock) {
            if (request != generation) return
            // Dernière publication : elle reprend aussi les images terminées entre-temps par un travail précédent.
            if (targets.isNotEmpty()) LiveWallpaperStore.savePlaylist(app, true, every, readyPaths(targets))
            removeUnused(File(app.filesDir, DIR), targets)
        }
    }

    private fun readyPaths(targets: List<Target>): List<String> = targets.filter { it.ready }.map { it.file.absolutePath }

    /** Supprime les images qui ne sont plus dans la liste, et les fichiers à moitié écrits. */
    private fun removeUnused(dir: File, targets: List<Target>) {
        val keep = targets.map { it.file.name }.toSet()
        dir.listFiles()?.filter { it.name !in keep }?.forEach { it.delete() }
        if (keep.isEmpty()) dir.delete()
    }
}
