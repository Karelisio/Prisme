package io.karelisio.prisme.wallpaper

import android.content.Context
import android.net.Uri
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLDecoder
import java.security.MessageDigest

/**
 * Fichiers images de l'app :
 * - cache/images : cache jetable (miniatures, téléchargements), purgé au-delà de [CACHE_LIMIT_BYTES] ;
 * - files/offline : copies conservées pour le hors ligne (favoris) ;
 * - files/imports, files/creations : images importées ou créées dans l'app.
 */
internal class ImageStore(context: Context) {
    private val cacheRoot = File(context.cacheDir, "images")
    private val offlineRoot = File(context.filesDir, "offline")
    val importsRoot = File(context.filesDir, "imports")
    val creationsRoot = File(context.filesDir, "creations")

    /** Renvoie un fichier local pour [uri] : URL distante (téléchargée), chemin local ou URL locale Capacitor. */
    fun resolve(uri: String, onProgress: ((Float) -> Unit)? = null): File {
        val file = when {
            uri.startsWith("https://") || uri.startsWith("http://") ->
                LocalUrls.toFilePath(uri)?.let(::File) ?: fetch(uri, persistent = false, onProgress = onProgress)
            uri.startsWith("file://") -> File(Uri.parse(uri).path ?: "")
            uri.startsWith("/") -> File(uri)
            else -> throw WallpaperException("INVALID_URI", "Adresse d'image invalide")
        }
        if (!file.isFile) throw WallpaperException("NOT_FOUND", "Image introuvable")
        return file
    }

    /** Télécharge [url] si besoin. [persistent] place le fichier hors du cache purgeable. */
    fun fetch(url: String, persistent: Boolean, onProgress: ((Float) -> Unit)? = null): File {
        val key = CacheKeys.of(url)
        val dir = if (persistent) offlineRoot else cacheRoot
        val target = File(dir, key)
        if (target.isFile && target.length() > 0) {
            target.setLastModified(System.currentTimeMillis())
            return target
        }
        val other = File(if (persistent) cacheRoot else offlineRoot, key)
        if (other.isFile && other.length() > 0) {
            if (!persistent) return other
            dir.mkdirs()
            other.copyTo(target, overwrite = true)
            return target
        }
        dir.mkdirs()
        Downloader.download(url, target, onProgress)
        if (!persistent) CacheTrimmer.trim(cacheRoot, CACHE_LIMIT_BYTES)
        return target
    }

    fun removeOffline(url: String): Boolean = File(offlineRoot, CacheKeys.of(url)).delete()

    fun sizes(): Pair<Long, Long> = CacheTrimmer.sizeOf(cacheRoot) to CacheTrimmer.sizeOf(offlineRoot)

    fun clear(includeOffline: Boolean) {
        cacheRoot.deleteRecursively()
        if (includeOffline) offlineRoot.deleteRecursively()
    }

    companion object {
        const val CACHE_LIMIT_BYTES = 300L * 1024 * 1024
    }
}

internal object CacheKeys {
    fun of(url: String): String = MessageDigest.getInstance("SHA-256")
        .digest(url.toByteArray(Charsets.UTF_8))
        .joinToString("") { "%02x".format(it) }
        .take(40)
}

internal object CacheTrimmer {
    fun sizeOf(dir: File): Long = dir.walkBottomUp().filter { it.isFile }.sumOf { it.length() }

    /** Supprime les fichiers les moins récemment utilisés jusqu'à repasser sous [limitBytes]. */
    fun trim(dir: File, limitBytes: Long) {
        val files = dir.listFiles()?.filter { it.isFile && !it.name.endsWith(".part") } ?: return
        var total = files.sumOf { it.length() }
        if (total <= limitBytes) return
        for (file in files.sortedBy { it.lastModified() }) {
            if (total <= limitBytes) break
            val size = file.length()
            if (file.delete()) total -= size
        }
    }
}

/** Les URL servies par le serveur local de Capacitor pointent vers des fichiers de l'app. */
internal object LocalUrls {
    private const val MARKER = "/_capacitor_file_"

    fun toFilePath(url: String): String? {
        val hostEnd = url.indexOf('/', url.indexOf("://") + 3)
        if (hostEnd < 0) return null
        val host = url.substring(url.indexOf("://") + 3, hostEnd).substringBefore(':')
        if (host != "localhost") return null
        val path = url.substring(hostEnd)
        if (!path.startsWith(MARKER)) return null
        // Décodage %XX sans traiter « + » comme un espace (ce sont des chemins, pas des formulaires).
        return URLDecoder.decode(path.removePrefix(MARKER).replace("+", "%2B"), "UTF-8")
    }
}

internal object Downloader {
    fun download(url: String, dest: File, onProgress: ((Float) -> Unit)?) {
        val connection = try {
            URL(url).openConnection() as HttpURLConnection
        } catch (e: IOException) {
            throw WallpaperException("DOWNLOAD_FAILED", "Adresse injoignable", e)
        }
        connection.connectTimeout = 15_000
        connection.readTimeout = 30_000
        connection.instanceFollowRedirects = true
        connection.setRequestProperty("User-Agent", "Prisme/1.0 (Android)")
        connection.setRequestProperty("Accept", "image/jpeg,image/png,image/webp,*/*;q=0.8")
        val tmp = File(dest.parentFile, "${dest.name}.part")
        try {
            val code = connection.responseCode
            if (code !in 200..299) throw WallpaperException("DOWNLOAD_FAILED", "Téléchargement impossible (HTTP $code)")
            val total = connection.contentLengthLong
            connection.inputStream.use { input ->
                tmp.outputStream().use { output ->
                    val buffer = ByteArray(64 * 1024)
                    var done = 0L
                    var lastPercent = 0
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        output.write(buffer, 0, read)
                        done += read
                        if (onProgress != null && total > 0) {
                            val percent = (done * 100 / total).toInt()
                            if (percent >= lastPercent + 5) {
                                lastPercent = percent
                                onProgress(percent / 100f)
                            }
                        }
                    }
                }
            }
            if (!tmp.renameTo(dest)) {
                tmp.copyTo(dest, overwrite = true)
                tmp.delete()
            }
        } catch (e: WallpaperException) {
            throw e
        } catch (e: IOException) {
            throw WallpaperException("DOWNLOAD_FAILED", "Téléchargement impossible : vérifie la connexion", e)
        } finally {
            tmp.delete()
            connection.disconnect()
        }
    }
}
