package io.karelisio.prisme.live

import org.json.JSONException
import org.json.JSONObject
import kotlin.math.ceil

private const val MEGABYTE = 1024L * 1024L

/**
 * Genre de média choisi dans la galerie. Chaque genre garde un seul fichier, copié dans files/live/media
 * (`<préfixe>.<extension>`) : le choix suivant remplace le précédent.
 */
enum class MediaKind(
    val key: String,
    /** Début du nom de fichier dans files/live/media. */
    val filePrefix: String,
    /** Taille maximale du fichier copié. */
    val maxBytes: Long,
    /** « Cette vidéo », « Ce GIF » : sujet des messages d'erreur. */
    val subject: String,
    /** Nom donné au fichier quand la galerie n'en fournit pas. */
    val fallbackName: String,
) {
    VIDEO("video", "video", 300 * MEGABYTE, "Cette vidéo", "Vidéo"),
    GIF("gif", "anim", 50 * MEGABYTE, "Ce GIF", "GIF"),
    ;

    companion object {
        fun fromKey(key: String?): MediaKind? = entries.firstOrNull { it.key == key }
    }
}

/**
 * Média choisi : le fichier copié dans l'app et ce qu'on en sait. Enregistré dans les préférences du fond animé
 * (clés `media_video` et `media_gif`, jamais dans les réglages d'une scène, que l'app réécrit en entier), affiché
 * dans l'app et relu par les fonds.
 */
data class MediaInfo(
    /** Nom du fichier dans files/live/media (`video.mp4`, `anim.gif`). */
    val file: String,
    /** Nom d'origine, tel que la galerie l'affichait. */
    val name: String,
    val sizeBytes: Long,
    /** Durée de la vidéo ; absente pour un GIF. */
    val durationMs: Long?,
    val width: Int,
    val height: Int,
    /** Instant du choix : change à chaque choix, même d'un fichier identique ; les fonds rechargent dessus. */
    val stamp: Long,
) {
    fun toJson(): String = JSONObject()
        .put("file", file)
        .put("name", name)
        .put("sizeBytes", sizeBytes)
        .apply { if (durationMs != null) put("durationMs", durationMs) }
        .put("width", width)
        .put("height", height)
        .put("stamp", stamp)
        .toString()

    companion object {
        /** Informations enregistrées ; une valeur absente, illisible ou dont le nom de fichier est un chemin donne null. */
        fun fromJson(raw: String?): MediaInfo? {
            if (raw.isNullOrBlank()) return null
            return try {
                val json = JSONObject(raw)
                val file = json.optString("file")
                if (!isSimpleName(file)) return null
                MediaInfo(
                    file = file,
                    name = json.optString("name").ifBlank { file },
                    sizeBytes = json.optLong("sizeBytes"),
                    durationMs = if (json.has("durationMs")) json.optLong("durationMs") else null,
                    width = json.optInt("width"),
                    height = json.optInt("height"),
                    stamp = json.optLong("stamp"),
                )
            } catch (e: JSONException) {
                null
            }
        }

        /** Nom de fichier seul : jamais un chemin (le fichier est cherché dans files/live/media). */
        fun isSimpleName(name: String): Boolean = name.isNotBlank() && !name.startsWith(".") && '/' !in name && '\\' !in name
    }
}

/** Règles du choix de média (pures, testées sur JVM). */
internal object MediaRules {
    /** Limite dépassée : le fichier n'est pas copié. */
    fun isTooLarge(kind: MediaKind, sizeBytes: Long): Boolean = sizeBytes > kind.maxBytes

    /**
     * Message d'erreur d'un fichier trop lourd. [sizeBytes] est la taille annoncée par la galerie ; sans elle
     * (flux sans longueur, coupé à la limite), seule la limite est donnée.
     */
    fun tooLargeMessage(kind: MediaKind, sizeBytes: Long?): String {
        val limit = megabytes(kind.maxBytes)
        return if (sizeBytes != null) "${kind.subject} pèse ${megabytes(sizeBytes)} Mo : la limite est de $limit Mo." else "${kind.subject} dépasse la limite de $limit Mo."
    }

    /** Mégaoctets arrondis au-dessus : un fichier refusé n'affiche jamais la valeur de la limite. */
    private fun megabytes(bytes: Long): Long = ceil(bytes.toDouble() / MEGABYTE).toLong()

    /**
     * Types proposés par le sélecteur de fichiers. Le WebP animé n'est lu qu'à partir d'Android 9 (ImageDecoder) :
     * avant, seul le GIF est proposé.
     */
    fun pickerTypes(kind: MediaKind, sdk: Int): List<String> = when (kind) {
        MediaKind.VIDEO -> listOf("video/*")
        MediaKind.GIF -> if (sdk >= 28) listOf("image/gif", "image/webp") else listOf("image/gif")
    }

    /** Format d'une image animée d'après ses premiers octets (le type annoncé par la galerie n'est pas fiable) : « gif », « webp » ou null. */
    fun imageExtension(header: ByteArray): String? = when {
        header.startsWithAscii("GIF87a") || header.startsWithAscii("GIF89a") -> "gif"
        header.startsWithAscii("RIFF") && header.hasAscii(8, "WEBP") -> "webp"
        else -> null
    }

    /** Extension du fichier d'une vidéo : d'après le type annoncé, sinon d'après le nom d'origine, sinon mp4 (le lecteur reconnaît le format au contenu). */
    fun videoExtension(mime: String?, displayName: String?): String {
        val fromMime = when (mime?.lowercase()) {
            "video/mp4", "video/x-m4v" -> "mp4"
            "video/webm" -> "webm"
            "video/x-matroska" -> "mkv"
            "video/3gpp", "video/3gpp2" -> "3gp"
            "video/quicktime" -> "mov"
            else -> null
        }
        if (fromMime != null) return fromMime
        val fromName = displayName?.substringAfterLast('.', "")?.lowercase().orEmpty()
        // « part » est le suffixe des copies en cours : un fichier ainsi nommé serait supprimé avec elles.
        val plausible = fromName.length in 2..4 && fromName.all { it.isLetterOrDigit() } && fromName != "part"
        return if (plausible) fromName else "mp4"
    }

    /** Taille affichée d'une vidéo : largeur et hauteur échangées si elle est tournée d'un quart de tour. */
    fun displaySize(width: Int, height: Int, rotation: Int): Pair<Int, Int> {
        val turn = (rotation % 360 + 360) % 360
        return if (turn == 90 || turn == 270) height to width else width to height
    }

    /**
     * Fichiers de files/live/media à supprimer une fois [keep] (le nouveau) en place : les anciens du genre [kind]
     * (autre extension, reste d'une copie interrompue), jamais ceux de l'autre genre.
     */
    fun staleFiles(names: List<String>, kind: MediaKind, keep: String): List<String> =
        names.filter { it.startsWith(kind.filePrefix + ".") && it != keep }

    /** Nom à afficher : celui de la galerie, sinon le nom du genre. */
    fun displayName(raw: String?, kind: MediaKind): String = raw?.trim().orEmpty().ifEmpty { kind.fallbackName }

    private fun ByteArray.startsWithAscii(text: String) = hasAscii(0, text)

    private fun ByteArray.hasAscii(offset: Int, text: String): Boolean {
        if (size < offset + text.length) return false
        return text.indices.all { this[offset + it] == text[it].code.toByte() }
    }
}
