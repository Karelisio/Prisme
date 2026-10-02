package io.karelisio.prisme.live

import android.content.Context
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import io.karelisio.prisme.wallpaper.WallpaperException
import java.io.File
import java.io.FileInputStream
import java.io.FileNotFoundException
import java.io.FileOutputStream
import java.io.IOException

/** Où sont la vidéo et le GIF choisis : un fichier par genre dans files/live/media, décrit par les préférences (voir [MediaInfo]). */
internal object LiveMedia {
    /** Fichier en cours de copie : jamais lu par un fond. */
    const val PART_SUFFIX = ".part"

    fun dir(context: Context): File = File(File(context.filesDir, "live"), "media")

    fun file(context: Context, info: MediaInfo): File = File(dir(context), info.file)

    /** Média prêt de ce genre : ses informations, tant que son fichier est là. */
    fun ready(context: Context, kind: MediaKind): MediaInfo? =
        LiveWallpaperStore.media(context, kind)?.takeIf { file(context, it).isFile }
}

/**
 * Copie une vidéo ou un GIF choisi dans la galerie vers files/live/media, où les fonds le lisent : le fichier de la
 * galerie peut disparaître ou changer sans que le fond s'en aperçoive. Écriture dans un fichier `.part` puis
 * renommé, taille limitée, contenu vérifié ; l'ancien fichier du même genre est supprimé une fois le nouveau en place.
 */
internal class MediaImporter(private val context: Context) {
    /** Ce qu'on a lu dans le fichier copié. */
    private class Details(val width: Int, val height: Int, val durationMs: Long?, val extension: String)

    /** Copie [uri] et enregistre le média ; [WallpaperException] (message lisible) si le fichier est refusé. */
    fun importMedia(uri: Uri, kind: MediaKind): MediaInfo = synchronized(LOCK) {
        val (displayName, declaredSize) = describe(uri)
        if (declaredSize != null && MediaRules.isTooLarge(kind, declaredSize)) {
            throw WallpaperException("TOO_LARGE", MediaRules.tooLargeMessage(kind, declaredSize))
        }
        val dir = LiveMedia.dir(context).apply { mkdirs() }
        val part = File(dir, kind.filePrefix + LiveMedia.PART_SUFFIX)
        try {
            val size = copy(uri, part, kind)
            val details = inspect(part, kind, context.contentResolver.getType(uri), displayName)
            val target = File(dir, "${kind.filePrefix}.${details.extension}")
            if (!part.renameTo(target)) throw WallpaperException("WRITE_FAILED", "Impossible d'enregistrer le fichier")
            val info = MediaInfo(
                file = target.name,
                name = MediaRules.displayName(displayName, kind),
                sizeBytes = size,
                durationMs = details.durationMs,
                width = details.width,
                height = details.height,
                stamp = System.currentTimeMillis(),
            )
            LiveWallpaperStore.saveMedia(context, kind, info)
            // L'ancien fichier du genre n'est supprimé qu'une fois le nouveau en place et enregistré : un fond qui
            // rouvre le média pendant ce temps trouve toujours un fichier.
            MediaRules.staleFiles(dir.list()?.toList().orEmpty(), kind, target.name).forEach { File(dir, it).delete() }
            info
        } finally {
            part.delete()
        }
    }

    /** Nom affiché et taille annoncée par la galerie ; l'un ou l'autre peut manquer. */
    private fun describe(uri: Uri): Pair<String?, Long?> {
        try {
            val columns = arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE)
            context.contentResolver.query(uri, columns, null, null, null)?.use { cursor ->
                if (!cursor.moveToFirst()) return null to null
                val nameColumn = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                val sizeColumn = cursor.getColumnIndex(OpenableColumns.SIZE)
                val name = if (nameColumn >= 0) cursor.getString(nameColumn) else null
                val size = if (sizeColumn >= 0 && !cursor.isNull(sizeColumn)) cursor.getLong(sizeColumn).takeIf { it >= 0 } else null
                return name to size
            }
        } catch (e: RuntimeException) {
            // Galerie capricieuse : la copie se fait sans ces informations.
        }
        return null to null
    }

    /** Copie le contenu de [uri] dans [out] ; s'arrête dès que la limite du genre est dépassée. Renvoie la taille copiée. */
    private fun copy(uri: Uri, out: File, kind: MediaKind): Long {
        val input = try {
            context.contentResolver.openInputStream(uri)
        } catch (e: FileNotFoundException) {
            null
        } catch (e: SecurityException) {
            throw WallpaperException("PERMISSION_DENIED", "Accès au fichier refusé", e)
        }
        if (input == null) throw WallpaperException("READ_FAILED", "Impossible de lire ce fichier")
        var total = 0L
        try {
            input.use { source ->
                FileOutputStream(out).use { sink ->
                    val buffer = ByteArray(COPY_BUFFER_BYTES)
                    while (true) {
                        val read = source.read(buffer)
                        if (read < 0) break
                        total += read
                        if (MediaRules.isTooLarge(kind, total)) throw WallpaperException("TOO_LARGE", MediaRules.tooLargeMessage(kind, null))
                        sink.write(buffer, 0, read)
                    }
                }
            }
        } catch (e: IOException) {
            throw WallpaperException("COPY_FAILED", "Impossible de copier ce fichier : il est illisible ou l'espace de stockage est plein", e)
        }
        if (total == 0L) throw WallpaperException("DECODE_FAILED", "Ce fichier est vide")
        return total
    }

    private fun inspect(file: File, kind: MediaKind, mime: String?, displayName: String?): Details = when (kind) {
        MediaKind.VIDEO -> inspectVideo(file, mime, displayName)
        MediaKind.GIF -> inspectImage(file)
    }

    private fun inspectVideo(file: File, mime: String?, displayName: String?): Details {
        val retriever = MediaMetadataRetriever()
        try {
            retriever.setDataSource(file.absolutePath)
            if (retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_HAS_VIDEO) != "yes") {
                throw WallpaperException("UNSUPPORTED", "Ce fichier ne contient pas de vidéo")
            }
            fun number(key: Int): Long? = retriever.extractMetadata(key)?.toLongOrNull()
            val (width, height) = MediaRules.displaySize(
                number(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toInt() ?: 0,
                number(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toInt() ?: 0,
                number(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toInt() ?: 0,
            )
            if (width <= 0 || height <= 0) throw WallpaperException("DECODE_FAILED", "Impossible de lire cette vidéo")
            return Details(width, height, number(MediaMetadataRetriever.METADATA_KEY_DURATION), MediaRules.videoExtension(mime, displayName))
        } catch (e: WallpaperException) {
            throw e
        } catch (e: RuntimeException) {
            // Format que ce téléphone ne sait pas lire : setDataSource lève une exception sans détail.
            throw WallpaperException("DECODE_FAILED", "Impossible de lire cette vidéo", e)
        } finally {
            retriever.release()
        }
    }

    private fun inspectImage(file: File): Details {
        val header = ByteArray(HEADER_BYTES)
        val read = FileInputStream(file).use { it.read(header) }
        val extension = MediaRules.imageExtension(header.copyOf(maxOf(read, 0)))
            ?: throw WallpaperException("UNSUPPORTED", if (Build.VERSION.SDK_INT >= 28) "Ce fichier n'est ni un GIF ni un WebP animé" else "Ce fichier n'est pas un GIF")
        if (extension == "webp" && Build.VERSION.SDK_INT < 28) {
            throw WallpaperException("UNSUPPORTED", "Le WebP animé demande Android 9 ou plus : choisis un GIF")
        }
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.absolutePath, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw WallpaperException("DECODE_FAILED", "Impossible de lire ce GIF")
        return Details(bounds.outWidth, bounds.outHeight, null, extension)
    }

    private companion object {
        /** Un seul choix à la fois : deux copies simultanées du même genre s'écraseraient. */
        val LOCK = Any()
        const val COPY_BUFFER_BYTES = 64 * 1024
        const val HEADER_BYTES = 16
    }
}
