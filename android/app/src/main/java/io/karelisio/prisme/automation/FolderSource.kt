package io.karelisio.prisme.automation

import android.content.Context
import android.provider.DocumentsContract
import androidx.core.net.toUri
import io.karelisio.prisme.wallpaper.WallpaperRef

/**
 * Rotation depuis un dossier du téléphone (choisi avec le sélecteur du système, accès conservé) :
 * les photos sont lues sur place, sans import, et la liste suit les ajouts et suppressions.
 */
internal object FolderSource {
    private const val MAX_ITEMS = 1000
    private val IMAGE_TYPES = setOf("image/jpeg", "image/png", "image/webp", "image/heic", "image/heif")

    data class Info(val name: String, val count: Int)

    /** Photos du dossier (premier niveau), triées par nom ; vide si l'accès a été retiré. */
    fun list(context: Context, treeUri: String): List<WallpaperRef> {
        val tree = treeUri.toUri()
        val children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree))
        val columns = arrayOf(DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_MIME_TYPE, DocumentsContract.Document.COLUMN_DISPLAY_NAME)
        val out = mutableListOf<Pair<String, WallpaperRef>>()
        runCatching {
            context.contentResolver.query(children, columns, null, null, null)?.use { cursor ->
                while (cursor.moveToNext() && out.size < MAX_ITEMS) {
                    val id = cursor.getString(0) ?: continue
                    if (cursor.getString(1)?.lowercase() !in IMAGE_TYPES) continue
                    val uri = DocumentsContract.buildDocumentUriUsingTree(tree, id).toString()
                    out += (cursor.getString(2) ?: id) to WallpaperRef("folder:$id", uri)
                }
            }
        }
        return out.sortedBy { it.first.lowercase() }.map { it.second }
    }

    fun info(context: Context, treeUri: String): Info {
        val tree = treeUri.toUri()
        val name = runCatching {
            val document = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree))
            context.contentResolver.query(document, arrayOf(DocumentsContract.Document.COLUMN_DISPLAY_NAME), null, null, null)?.use {
                if (it.moveToFirst()) it.getString(0) else null
            }
        }.getOrNull() ?: "Dossier"
        return Info(name, list(context, treeUri).size)
    }

    /** L'app a toujours l'autorisation de lire ce dossier. */
    fun accessible(context: Context, treeUri: String): Boolean =
        context.contentResolver.persistedUriPermissions.any { it.uri.toString() == treeUri && it.isReadPermission }
}
