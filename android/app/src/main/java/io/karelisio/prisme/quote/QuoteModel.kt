package io.karelisio.prisme.quote

import io.karelisio.prisme.wallpaper.WallpaperTarget
import org.json.JSONObject

internal enum class QuoteFont(val key: String) {
    SERIF("serif"),
    SANS("sans");

    companion object {
        fun fromKey(key: String?) = entries.firstOrNull { it.key == key }
    }
}

internal enum class QuotePosition(val key: String) {
    TOP("top"),
    CENTER("center"),
    BOTTOM("bottom");

    companion object {
        fun fromKey(key: String?) = entries.firstOrNull { it.key == key }
    }
}

/** [factor] : corps du texte en fraction de la largeur de l'écran. */
internal enum class QuoteSize(val key: String, val factor: Double) {
    SMALL("small", 0.05),
    MEDIUM("medium", 0.062),
    LARGE("large", 0.076);

    companion object {
        fun fromKey(key: String?) = entries.firstOrNull { it.key == key }
    }
}

internal enum class QuoteColor(val key: String) {
    AUTO("auto"),
    WHITE("white"),
    BLACK("black");

    companion object {
        fun fromKey(key: String?) = entries.firstOrNull { it.key == key }
    }
}

/** Écran qui reçoit la phrase : elle n'a pas la même place sur l'accueil et sur le verrouillage. */
internal enum class QuoteScreen { HOME, LOCK }

internal data class QuoteStyle(
    val font: QuoteFont = QuoteFont.SERIF,
    val position: QuotePosition = QuotePosition.BOTTOM,
    val size: QuoteSize = QuoteSize.MEDIUM,
    val color: QuoteColor = QuoteColor.AUTO,
)

internal data class Quote(val text: String, val author: String? = null)

/**
 * Réglages envoyés par l'app : la liste active des phrases (proverbes, citations perso ou les deux : une
 * seule source de vérité, choisie côté app) et leur présentation. Le choix du jour se fait ici, app fermée
 * (voir [QuoteSelector]).
 */
internal data class QuoteConfig(
    val enabled: Boolean = false,
    /** Écran(s) qui reçoivent la phrase. */
    val target: WallpaperTarget = WallpaperTarget.LOCK,
    val style: QuoteStyle = QuoteStyle(),
    /** Crans avancés par « Une autre » : la suite des phrases saute d'autant. */
    val shift: Int = 0,
    val quotes: List<Quote> = emptyList(),
) {
    fun appliesTo(screen: QuoteScreen): Boolean = enabled && when (screen) {
        QuoteScreen.HOME -> target != WallpaperTarget.LOCK
        QuoteScreen.LOCK -> target != WallpaperTarget.HOME
    }

    companion object {
        /** Bornes de sûreté : l'app en envoie bien moins, mais un fichier abîmé ne doit rien faire exploser. */
        const val MAX_QUOTES = 1000
        const val MAX_TEXT = 400
        const val MAX_AUTHOR = 120

        fun parse(raw: String?): QuoteConfig {
            if (raw.isNullOrBlank()) return QuoteConfig()
            return runCatching { fromJson(JSONObject(raw)) }.getOrDefault(QuoteConfig())
        }

        fun fromJson(json: JSONObject): QuoteConfig {
            val array = json.optJSONArray("quotes")
            val quotes = buildList {
                for (i in 0 until minOf(array?.length() ?: 0, MAX_QUOTES)) {
                    val item = array?.optJSONObject(i) ?: continue
                    val text = item.optString("text").trim().take(MAX_TEXT).trim()
                    if (text.isEmpty()) continue
                    add(Quote(text, item.optString("author").trim().take(MAX_AUTHOR).trim().ifEmpty { null }))
                }
            }
            return QuoteConfig(
                enabled = json.optBoolean("enabled"),
                target = WallpaperTarget.fromKey(json.optString("target")) ?: WallpaperTarget.LOCK,
                style = QuoteStyle(
                    font = QuoteFont.fromKey(json.optString("font")) ?: QuoteFont.SERIF,
                    position = QuotePosition.fromKey(json.optString("position")) ?: QuotePosition.BOTTOM,
                    size = QuoteSize.fromKey(json.optString("size")) ?: QuoteSize.MEDIUM,
                    color = QuoteColor.fromKey(json.optString("color")) ?: QuoteColor.AUTO,
                ),
                shift = json.optInt("shift", 0).coerceAtLeast(0),
                quotes = quotes,
            )
        }
    }
}

/** La phrase du jour avec sa présentation : ce que le rendu doit dessiner. */
internal data class QuoteSpec(val quote: Quote, val style: QuoteStyle, val target: WallpaperTarget) {
    fun appliesTo(screen: QuoteScreen): Boolean = when (screen) {
        QuoteScreen.HOME -> target != WallpaperTarget.LOCK
        QuoteScreen.LOCK -> target != WallpaperTarget.HOME
    }

    /** Identité du rendu : change dès que la phrase ou sa présentation change. */
    fun key(): String = listOf(quote.text, quote.author.orEmpty(), style.font.key, style.position.key, style.size.key, style.color.key).joinToString("\n")
}
