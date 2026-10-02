package io.karelisio.prisme.wallpaper

import android.content.ClipData
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.media.MediaScannerConnection
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.annotation.RequiresApi
import androidx.core.content.FileProvider
import java.io.File

/** Sortie d'une image hors de l'app : galerie du téléphone (Images/Prisme) ou partage. */
internal class ImageExport(private val context: Context) {

    /** Copie [file] dans la galerie ; renvoie le dossier visible par l'utilisateur. */
    fun saveToGallery(file: File, displayName: String): String {
        val mime = ImageFormats.mimeOf(file)
        val name = "${ImageFormats.safeName(displayName)}.${ImageFormats.extensionOf(mime)}"
        return if (Build.VERSION.SDK_INT >= 29) saveScoped(file, name, mime) else saveLegacy(file, name, mime)
    }

    @RequiresApi(29)
    private fun saveScoped(file: File, name: String, mime: String): String {
        val resolver = context.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, name)
            put(MediaStore.Images.Media.MIME_TYPE, mime)
            put(MediaStore.Images.Media.RELATIVE_PATH, "${Environment.DIRECTORY_PICTURES}/$FOLDER")
            put(MediaStore.Images.Media.IS_PENDING, 1)
        }
        val uri = resolver.insert(MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), values)
            ?: throw WallpaperException("SAVE_FAILED", "La galerie n'accepte pas l'image")
        try {
            resolver.openOutputStream(uri)?.use { out -> file.inputStream().use { it.copyTo(out) } }
                ?: throw WallpaperException("SAVE_FAILED", "La galerie n'accepte pas l'image")
            resolver.update(uri, ContentValues().apply { put(MediaStore.Images.Media.IS_PENDING, 0) }, null, null)
        } catch (e: Exception) {
            resolver.delete(uri, null, null)
            if (e is WallpaperException) throw e
            throw WallpaperException("SAVE_FAILED", "Impossible d'enregistrer dans la galerie", e)
        }
        return "${Environment.DIRECTORY_PICTURES}/$FOLDER"
    }

    @Suppress("DEPRECATION")
    private fun saveLegacy(file: File, name: String, mime: String): String {
        val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), FOLDER)
        if (!dir.isDirectory && !dir.mkdirs()) throw WallpaperException("SAVE_FAILED", "Impossible de créer le dossier Images/$FOLDER")
        val target = ImageFormats.uniqueFile(dir, name)
        file.copyTo(target)
        MediaScannerConnection.scanFile(context, arrayOf(target.path), arrayOf(mime), null)
        return "${Environment.DIRECTORY_PICTURES}/$FOLDER"
    }

    /** Copie partageable (FileProvider) et sélecteur d'applis de partage. */
    fun shareIntent(file: File, displayName: String, text: String?, title: String): Intent {
        val mime = ImageFormats.mimeOf(file)
        val dir = File(context.cacheDir, "share").apply {
            deleteRecursively()
            mkdirs()
        }
        val copy = File(dir, "${ImageFormats.safeName(displayName)}.${ImageFormats.extensionOf(mime)}")
        file.copyTo(copy, overwrite = true)
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", copy)
        val send = Intent(Intent.ACTION_SEND)
            .setType(mime)
            .putExtra(Intent.EXTRA_STREAM, uri)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        if (!text.isNullOrBlank()) send.putExtra(Intent.EXTRA_TEXT, text)
        send.clipData = ClipData.newRawUri(null, uri)
        return Intent.createChooser(send, title)
    }

    private companion object {
        const val FOLDER = "Prisme"
    }
}

internal object ImageFormats {
    fun mimeOf(file: File): String {
        val header = ByteArray(12)
        val read = file.inputStream().use { it.read(header) }
        return mimeOf(if (read < header.size) header.copyOf(maxOf(read, 0)) else header)
    }

    /** Type d'après la signature du fichier (les URL ne disent rien de fiable). */
    fun mimeOf(header: ByteArray): String = when {
        header.size >= 3 && header[0] == 0xFF.toByte() && header[1] == 0xD8.toByte() && header[2] == 0xFF.toByte() -> "image/jpeg"
        header.size >= 8 && header.copyOfRange(0, 8).contentEquals(PNG) -> "image/png"
        header.size >= 12 && String(header, 0, 4, Charsets.US_ASCII) == "RIFF" && String(header, 8, 4, Charsets.US_ASCII) == "WEBP" -> "image/webp"
        else -> "image/jpeg"
    }

    fun extensionOf(mime: String): String = when (mime) {
        "image/png" -> "png"
        "image/webp" -> "webp"
        else -> "jpg"
    }

    fun safeName(name: String): String =
        name.replace(Regex("[^A-Za-z0-9._-]+"), "_").trim('_', '.').take(80).ifBlank { "Prisme" }

    /** « nom.jpg », sinon « nom (2).jpg », « nom (3).jpg »… */
    fun uniqueFile(dir: File, name: String): File {
        val base = name.substringBeforeLast('.')
        val ext = name.substringAfterLast('.', "")
        var candidate = File(dir, name)
        var n = 2
        while (candidate.exists()) candidate = File(dir, if (ext.isEmpty()) "$base ($n)" else "$base ($n).$ext").also { n++ }
        return candidate
    }

    private val PNG = byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)
}
