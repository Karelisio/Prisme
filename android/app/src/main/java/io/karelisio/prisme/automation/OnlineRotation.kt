package io.karelisio.prisme.automation

import android.content.Context
import android.net.ConnectivityManager
import androidx.core.content.edit
import io.karelisio.prisme.wallpaper.WallpaperRef
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.text.Normalizer
import kotlin.math.ceil
import kotlin.math.max
import kotlin.random.Random

/** Requête d'une source pour la rotation en ligne, préparée par l'app (thème, clés API). */
data class OnlineQuery(
    /** unsplash, pexels, wallhaven, nasa ou art. */
    val provider: String,
    val query: String = "",
    /** Unsplash : photos de ce photographe plutôt qu'une recherche. */
    val username: String = "",
    /** Wallhaven : catégories (« 100 » = général). */
    val categories: String = "",
    /** En-tête Authorization (Unsplash, Pexels). */
    val auth: String = "",
) {
    companion object {
        fun fromJson(json: JSONObject): OnlineQuery? {
            val provider = json.optString("provider").takeIf { it in OnlineSources.PROVIDERS } ?: return null
            return OnlineQuery(
                provider = provider,
                query = json.optString("query"),
                username = json.optString("username"),
                categories = json.optString("categories"),
                auth = json.optString("auth"),
            )
        }
    }
}

/** Contenus masqués dans l'app : jamais choisis par la rotation. */
data class OnlineExclusions(
    val ids: Set<String> = emptySet(),
    /** « source:nom » normalisé, comme dans l'app. */
    val authors: Set<String> = emptySet(),
    val words: List<String> = emptyList(),
) {
    fun excludes(c: OnlineCandidate): Boolean {
        if (c.id in ids) return true
        val author = c.username ?: c.authorName
        if (author != null && "${c.source}:${OnlineSources.normalize(author)}" in authors) return true
        return words.any { OnlineSources.mentions(c.alt, it) }
    }

    companion object {
        fun fromJson(json: JSONObject?): OnlineExclusions {
            if (json == null) return OnlineExclusions()
            fun strings(name: String) = json.optJSONArray(name)?.let { a -> (0 until a.length()).mapNotNull { a.optString(it).ifBlank { null } } }.orEmpty()
            return OnlineExclusions(strings("ids").toSet(), strings("authors").toSet(), strings("words"))
        }
    }
}

/** Rotation « en ligne » : des fonds pris au hasard chez les sources, selon le thème choisi. */
data class OnlineConfig(
    /** Change avec le thème ou les sources : la file de candidats repart de zéro. */
    val key: String,
    val queries: List<OnlineQuery>,
    val wifiOnly: Boolean = false,
    val exclusions: OnlineExclusions = OnlineExclusions(),
) {
    companion object {
        fun fromJson(json: JSONObject?): OnlineConfig? {
            if (json == null) return null
            val array = json.optJSONArray("queries") ?: return null
            val queries = (0 until array.length()).mapNotNull { i -> array.optJSONObject(i)?.let(OnlineQuery::fromJson) }
            if (queries.isEmpty()) return null
            return OnlineConfig(
                key = json.optString("key"),
                queries = queries,
                wifiOnly = json.optBoolean("wifiOnly"),
                exclusions = OnlineExclusions.fromJson(json.optJSONObject("exclude")),
            )
        }
    }
}

/** Fond trouvé en ligne : l'image à appliquer et sa description complète pour l'historique de l'app. */
data class OnlineCandidate(
    val id: String,
    val source: String,
    val width: Int,
    val height: Int,
    val color: String,
    val alt: String,
    val thumb: String,
    val preview: String,
    val full: String,
    /** Image appliquée : à la taille de l'écran quand la source sait redimensionner. */
    val applyUrl: String,
    val authorName: String? = null,
    val authorUrl: String? = null,
    val username: String? = null,
    val pageUrl: String? = null,
    /** Unsplash : à appeler quand la photo est utilisée (exigence de l'API). */
    val downloadLocation: String? = null,
) {
    fun ref() = WallpaperRef(id, applyUrl)

    /** Même forme que `Wallpaper` côté app. */
    fun toWallpaperJson(): JSONObject = JSONObject().apply {
        put("id", id)
        put("source", source)
        put("width", width)
        put("height", height)
        put("color", color)
        put("alt", alt)
        put("thumb", thumb)
        put("preview", preview)
        put("full", full)
        if (authorName != null && authorUrl != null) {
            put("author", JSONObject().put("name", authorName).put("url", authorUrl).apply { username?.let { put("username", it) } })
        }
        pageUrl?.let { put("pageUrl", it) }
        downloadLocation?.let { put("downloadLocation", it) }
    }

    fun toJson(): JSONObject = toWallpaperJson().put("applyUrl", applyUrl)

    companion object {
        fun fromJson(json: JSONObject?): OnlineCandidate? {
            if (json == null) return null
            val id = json.optString("id").ifBlank { return null }
            val full = json.optString("full").ifBlank { return null }
            val author = json.optJSONObject("author")
            return OnlineCandidate(
                id = id,
                source = json.optString("source"),
                width = json.optInt("width"),
                height = json.optInt("height"),
                color = json.optString("color", OnlineSources.UNKNOWN_COLOR),
                alt = json.optString("alt"),
                thumb = json.optString("thumb"),
                preview = json.optString("preview"),
                full = full,
                applyUrl = json.optString("applyUrl").ifBlank { full },
                authorName = author?.optString("name")?.ifBlank { null },
                authorUrl = author?.optString("url")?.ifBlank { null },
                username = author?.optString("username")?.ifBlank { null },
                pageUrl = json.optString("pageUrl").ifBlank { null },
                downloadLocation = json.optString("downloadLocation").ifBlank { null },
            )
        }
    }
}

/** Résultat d'une demande de nouveau fond en ligne. */
sealed interface OnlinePick {
    data class Ready(val ref: WallpaperRef) : OnlinePick

    /** Pas maintenant (connexion limitée et « Wi-Fi seulement ») : on garde le fond actuel. */
    data object Later : OnlinePick

    /** Aucune source n'a répondu : à réessayer. */
    data object Failed : OnlinePick
}

/**
 * Sources de la rotation en ligne : construction des requêtes et lecture des réponses (logique
 * pure, testée sur JVM), plus l'appel réseau. Les conversions reprennent celles de l'app.
 */
internal object OnlineSources {
    val PROVIDERS = setOf("unsplash", "pexels", "wallhaven", "nasa", "art")
    const val UNKNOWN_COLOR = "#808080"
    private const val MIN_HEIGHT = 1920
    private const val MIN_PORTRAIT_RATIO = 1.2
    private const val THUMB_WIDTH = 360
    private const val UTM = "utm_source=prisme&utm_medium=referral"

    data class Screen(val width: Int, val height: Int)

    data class Request(val url: String, val headers: Map<String, String>)

    fun request(q: OnlineQuery, random: Random, firstPage: Boolean = false): Request {
        fun page(max: Int) = if (firstPage) 1 else random.nextInt(1, max + 1)
        return when (q.provider) {
            "unsplash" -> {
                val headers = mapOf("Authorization" to q.auth, "Accept-Version" to "v1")
                if (q.username.isNotBlank()) {
                    Request(
                        url("https://api.unsplash.com/users/${encode(q.username)}/photos", "page" to page(5), "per_page" to 30, "orientation" to "portrait", "order_by" to "latest"),
                        headers,
                    )
                } else {
                    Request(
                        url("https://api.unsplash.com/photos/random", "count" to 30, "orientation" to "portrait", "content_filter" to "high", "query" to q.query.ifBlank { null }),
                        headers,
                    )
                }
            }
            "pexels" -> Request(
                if (q.query.isBlank()) url("https://api.pexels.com/v1/curated", "per_page" to 40, "page" to page(20))
                else url("https://api.pexels.com/v1/search", "query" to q.query, "orientation" to "portrait", "per_page" to 40, "page" to page(10)),
                mapOf("Authorization" to q.auth),
            )
            "wallhaven" -> Request(
                url(
                    "https://wallhaven.cc/api/v1/search",
                    "q" to q.query.ifBlank { null },
                    "categories" to q.categories.ifBlank { "111" },
                    "purity" to "100",
                    "ratios" to "portrait",
                    "atleast" to "1080x1920",
                    "sorting" to "random",
                ),
                emptyMap(),
            )
            "nasa" -> Request(
                url("https://images-api.nasa.gov/search", "q" to q.query.ifBlank { "nebula" }, "media_type" to "image", "page" to page(5), "page_size" to 100),
                emptyMap(),
            )
            else -> Request(
                url(
                    "https://openaccess-api.clevelandart.org/api/artworks/",
                    "q" to q.query.ifBlank { null },
                    "type" to "Painting",
                    "has_image" to 1,
                    "cc0" to 1,
                    "limit" to 100,
                    "skip" to (page(15) - 1) * 100,
                    "fields" to "id,title,creation_date,url,creators,images",
                ),
                emptyMap(),
            )
        }
    }

    /** Candidats d'une réponse, déjà filtrés (portrait HD) ; les tailles appliquées couvrent l'écran. */
    fun parse(provider: String, body: String, screen: Screen): List<OnlineCandidate> {
        val items = when (provider) {
            "unsplash" -> array(body) { JSONObject(it).optJSONArray("results") }.objects().map { unsplash(it, screen) }
            "pexels" -> JSONObject(body).optJSONArray("photos").objects()
                .filter { it.optString("type", "Photo") == "Photo" }
                .map { pexels(it, screen) }
            "wallhaven" -> JSONObject(body).optJSONArray("data").objects().map(::wallhaven)
            "nasa" -> JSONObject(body).optJSONObject("collection")?.optJSONArray("items").objects().mapNotNull(::nasa)
            else -> JSONObject(body).optJSONArray("data").objects().mapNotNull(::artwork)
        }
        return items.filter(::fits)
    }

    fun fits(c: OnlineCandidate): Boolean {
        if (c.source == "nasa") return c.width == 0 || c.height >= MIN_HEIGHT
        return c.width > 0 && c.height >= MIN_HEIGHT && c.height.toDouble() / c.width >= MIN_PORTRAIT_RATIO
    }

    /** Largeur qui couvre l'écran à l'échelle 1 (un peu de marge), sans dépasser l'original. */
    fun coverWidth(width: Int, height: Int, screen: Screen): Int {
        if (width <= 0 || height <= 0) return screen.width
        val needed = max(screen.width.toDouble(), screen.height.toDouble() * width / height) * 1.1
        return ceil(needed).toInt().coerceIn(1, width)
    }

    private fun unsplash(p: JSONObject, screen: Screen): OnlineCandidate {
        val raw = p.getJSONObject("urls").getString("raw")
        val width = p.optInt("width")
        val height = p.optInt("height")
        val user = p.optJSONObject("user")
        val links = p.optJSONObject("links")
        return OnlineCandidate(
            id = "unsplash:${p.getString("id")}",
            source = "unsplash",
            width = width,
            height = height,
            color = p.optString("color").ifBlank { UNKNOWN_COLOR }.takeUnless { it == "null" } ?: UNKNOWN_COLOR,
            alt = p.optString("alt_description").takeUnless { it.isBlank() || it == "null" }
                ?: p.optString("description").takeUnless { it.isBlank() || it == "null" }
                ?: "Photo Unsplash",
            thumb = withParams(raw, "w" to THUMB_WIDTH, "h" to THUMB_WIDTH * 16 / 9, "fit" to "crop", "q" to 60, "auto" to "format"),
            preview = withParams(raw, "w" to 1080, "fit" to "max", "q" to 80, "auto" to "format"),
            full = withParams(raw, "w" to minOf(width, 3200), "fit" to "max", "q" to 90, "fm" to "jpg"),
            applyUrl = withParams(raw, "w" to coverWidth(width, height, screen), "fit" to "max", "q" to 85, "fm" to "jpg"),
            authorName = user?.optString("name"),
            authorUrl = user?.optJSONObject("links")?.optString("html")?.let(::withUtm),
            username = user?.optString("username")?.ifBlank { null },
            pageUrl = links?.optString("html")?.ifBlank { null }?.let(::withUtm),
            downloadLocation = links?.optString("download_location")?.ifBlank { null },
        )
    }

    private fun pexels(p: JSONObject, screen: Screen): OnlineCandidate {
        val base = p.getJSONObject("src").getString("original")
        val width = p.optInt("width")
        val height = p.optInt("height")
        val small = "auto" to "compress"
        val srgb = "cs" to "tinysrgb"
        return OnlineCandidate(
            id = "pexels:${p.get("id")}",
            source = "pexels",
            width = width,
            height = height,
            color = p.optString("avg_color").takeUnless { it.isBlank() || it == "null" } ?: UNKNOWN_COLOR,
            alt = p.optString("alt").takeUnless { it.isBlank() || it == "null" } ?: "Photo Pexels",
            thumb = withParams(base, small, srgb, "fit" to "crop", "w" to THUMB_WIDTH, "h" to THUMB_WIDTH * 16 / 9),
            preview = withParams(base, small, srgb, "w" to 1080),
            full = withParams(base, small, srgb, "w" to minOf(width, 3200)),
            applyUrl = withParams(base, small, srgb, "w" to coverWidth(width, height, screen)),
            authorName = p.optString("photographer").ifBlank { null },
            authorUrl = p.optString("photographer_url").ifBlank { null },
            pageUrl = p.optString("url").ifBlank { null },
        )
    }

    private fun wallhaven(w: JSONObject): OnlineCandidate {
        val id = w.getString("id")
        val path = w.getString("path")
        return OnlineCandidate(
            id = "wallhaven:$id",
            source = "wallhaven",
            width = w.optInt("dimension_x"),
            height = w.optInt("dimension_y"),
            color = w.optJSONArray("colors")?.optString(0)?.ifBlank { null } ?: UNKNOWN_COLOR,
            alt = "Fond Wallhaven $id",
            thumb = w.optJSONObject("thumbs")?.optString("original")?.ifBlank { null } ?: path,
            preview = path,
            full = path,
            applyUrl = path,
            pageUrl = w.optString("url").ifBlank { null },
        )
    }

    private fun nasa(item: JSONObject): OnlineCandidate? {
        val data = item.optJSONArray("data")?.optJSONObject(0) ?: return null
        if (data.optString("media_type") != "image") return null
        val links = item.optJSONArray("links").objects().filter { it.optString("render", "image") == "image" }
        val thumb = links.firstOrNull { it.optString("rel") == "preview" } ?: links.firstOrNull() ?: return null
        val original = links.firstOrNull { it.optString("rel") == "canonical" }
        val large = links.firstOrNull { Regex("~large\\.\\w+$").containsMatchIn(it.optString("href")) }
        val nasaId = data.getString("nasa_id")
        val page = "https://images.nasa.gov/details/${encode(nasaId).replace("+", "%20")}"
        val credit = data.optString("secondary_creator").ifBlank { null }
            ?: data.optString("photographer").ifBlank { null }
            ?: data.optString("center").ifBlank { null }?.let { "NASA $it" }
            ?: "NASA"
        val full = original?.optString("href")?.ifBlank { null } ?: variant(thumb.getString("href"), "orig")
        return OnlineCandidate(
            id = "nasa:$nasaId",
            source = "nasa",
            width = original?.optInt("width") ?: 0,
            height = original?.optInt("height") ?: 0,
            color = UNKNOWN_COLOR,
            alt = data.optString("title"),
            thumb = thumb.getString("href"),
            preview = large?.optString("href")?.ifBlank { null } ?: variant(thumb.getString("href"), "large"),
            full = full,
            applyUrl = full,
            authorName = credit,
            authorUrl = page,
            pageUrl = page,
        )
    }

    private fun artwork(a: JSONObject): OnlineCandidate? {
        val images = a.optJSONObject("images") ?: return null
        val web = images.optJSONObject("web") ?: return null
        val print = images.optJSONObject("print") ?: web
        val width = print.optString("width").toIntOrNull() ?: print.optInt("width")
        val height = print.optString("height").toIntOrNull() ?: print.optInt("height")
        val webUrl = web.optString("url").ifBlank { return null }
        val printUrl = print.optString("url").ifBlank { return null }
        if (width <= 0 || height <= 0) return null
        val title = a.optString("title")
        val date = a.optString("creation_date").takeUnless { it.isBlank() || it == "null" }
        val creator = a.optJSONArray("creators")?.optJSONObject(0)?.optString("description")?.let(::creatorName)?.ifBlank { null }
        val url = a.optString("url")
        return OnlineCandidate(
            id = "art:${a.get("id")}",
            source = "art",
            width = width,
            height = height,
            color = UNKNOWN_COLOR,
            alt = if (date != null) "$title ($date)" else title,
            thumb = webUrl,
            preview = printUrl,
            full = printUrl,
            applyUrl = printUrl,
            authorName = creator,
            authorUrl = creator?.let { url },
            pageUrl = url.ifBlank { null },
        )
    }

    /** « Claude Monet (French, 1840–1926) » → « Claude Monet ». */
    fun creatorName(description: String): String = description.replace(Regex("\\s*\\(.*$", RegexOption.DOT_MATCHES_ALL), "").trim()

    /** Variante d'un fichier NASA : « X~thumb.jpg » → « X~large.jpg ». */
    fun variant(href: String, size: String): String =
        href.replace(Regex("~(thumb|small|medium|large)\\.(\\w+)(\\?[^#]*)?$")) { "~$size.${it.groupValues[2]}${it.groupValues[3]}" }

    /** Minuscules sans accents, comme dans l'app. */
    fun normalize(text: String): String =
        Normalizer.normalize(text, Normalizer.Form.NFD).replace(Regex("\\p{Mn}+"), "").lowercase()

    /** La description évoque ce sujet : mot entier (pluriel en -s/-x toléré) ou expression exacte. */
    fun mentions(alt: String, word: String): Boolean {
        val target = normalize(word).trim()
        if (target.isEmpty()) return false
        val tokens = normalize(alt).split(Regex("[^a-z0-9]+")).filter { it.isNotEmpty() }
        if (' ' in target) return " ${tokens.joinToString(" ")} ".contains(" ${target.split(Regex("\\s+")).joinToString(" ")} ")
        return tokens.any { it == target || it == "${target}s" || it == "${target}x" || "${it}s" == target }
    }

    fun withUtm(url: String): String = if ('?' in url) "$url&$UTM" else "$url?$UTM"

    /** Ajoute ou remplace des paramètres de requête (sans dépendre d'android.net.Uri). */
    fun withParams(url: String, vararg params: Pair<String, Any?>): String {
        val hashIndex = url.indexOf('#')
        val base = if (hashIndex >= 0) url.substring(0, hashIndex) else url
        val queryIndex = base.indexOf('?')
        val path = if (queryIndex >= 0) base.substring(0, queryIndex) else base
        val existing = LinkedHashMap<String, String>()
        if (queryIndex >= 0) {
            base.substring(queryIndex + 1).split('&').filter { it.isNotEmpty() }.forEach { part ->
                val eq = part.indexOf('=')
                if (eq < 0) existing[part] = "" else existing[part.substring(0, eq)] = part.substring(eq + 1)
            }
        }
        for ((key, value) in params) if (value != null) existing[key] = encode(value.toString())
        val query = existing.entries.joinToString("&") { (k, v) -> if (v.isEmpty()) k else "$k=$v" }
        return if (query.isEmpty()) path else "$path?$query"
    }

    private fun url(base: String, vararg params: Pair<String, Any?>) = withParams(base, *params)

    private fun encode(value: String): String = URLEncoder.encode(value, "UTF-8")

    private fun array(body: String, fallback: (String) -> JSONArray?): JSONArray? {
        val trimmed = body.trimStart()
        return if (trimmed.startsWith("[")) JSONArray(trimmed) else fallback(trimmed)
    }

    private fun JSONArray?.objects(): List<JSONObject> =
        if (this == null) emptyList() else (0 until length()).mapNotNull { optJSONObject(it) }

    /** Interroge une source ; une page tirée au hasard et vide est retentée en page 1. */
    fun fetch(q: OnlineQuery, random: Random, screen: Screen): List<OnlineCandidate> {
        val first = parse(q.provider, get(request(q, random)), screen)
        if (first.isNotEmpty() || q.provider == "wallhaven" || (q.provider == "unsplash" && q.username.isBlank())) return first
        return parse(q.provider, get(request(q, random, firstPage = true)), screen)
    }

    /** Unsplash : signale l'utilisation de la photo (obligatoire), sans conséquence en cas d'échec. */
    fun trackDownload(candidate: OnlineCandidate, queries: List<OnlineQuery>) {
        val location = candidate.downloadLocation ?: return
        val auth = queries.firstOrNull { it.provider == "unsplash" && it.auth.isNotBlank() }?.auth ?: return
        runCatching { get(Request(location, mapOf("Authorization" to auth, "Accept-Version" to "v1"))) }
    }

    private fun get(request: Request): String {
        val connection = URL(request.url).openConnection() as HttpURLConnection
        connection.connectTimeout = 15_000
        connection.readTimeout = 20_000
        connection.setRequestProperty("Accept", "application/json")
        connection.setRequestProperty("User-Agent", "Prisme/1.0 (Android)")
        request.headers.forEach { (k, v) -> if (v.isNotBlank()) connection.setRequestProperty(k, v) }
        try {
            val code = connection.responseCode
            if (code !in 200..299) throw IOException("HTTP $code")
            return connection.inputStream.bufferedReader().use { it.readText() }
        } finally {
            connection.disconnect()
        }
    }
}

/**
 * Derniers fonds trouvés en ligne (rotation, fêtes) : leur description complète accompagne le journal
 * pour l'historique de l'app, et sert au suivi des téléchargements Unsplash.
 */
internal class OnlineCatalog(context: Context) {
    private val prefs = context.getSharedPreferences("prisme_online_catalog", Context.MODE_PRIVATE)

    fun remember(candidate: OnlineCandidate) = synchronized(LOCK) {
        val all = runCatching { JSONObject(prefs.getString(KEY, "{}") ?: "{}") }.getOrDefault(JSONObject())
        all.put(candidate.id, candidate.toJson())
        // Les plus anciens partent d'abord (l'ordre d'insertion est conservé).
        while (all.length() > MAX) all.remove(all.keys().next())
        prefs.edit { putString(KEY, all.toString()) }
    }

    fun find(id: String): OnlineCandidate? = synchronized(LOCK) {
        val all = runCatching { JSONObject(prefs.getString(KEY, "{}") ?: "{}") }.getOrNull() ?: return null
        OnlineCandidate.fromJson(all.optJSONObject(id))
    }

    private companion object {
        val LOCK = Any()
        const val KEY = "items"
        const val MAX = 20
    }
}

/**
 * File de fonds en ligne à venir (SharedPreferences) : remplie par lots auprès des sources, chacune
 * à son tour, sans reprendre un fond récent ni un contenu masqué.
 */
internal class OnlineQueue(context: Context) {
    private val prefs = context.getSharedPreferences("prisme_online", Context.MODE_PRIVATE)
    private val catalog = OnlineCatalog(context)

    fun next(
        config: OnlineConfig,
        random: Random,
        fetch: (OnlineQuery) -> List<OnlineCandidate>,
        preferDark: Boolean = false,
    ): OnlineCandidate? = synchronized(LOCK) {
        if (prefs.getString(KEY_CONFIG, null) != config.key) {
            prefs.edit {
                putString(KEY_CONFIG, config.key)
                remove(KEY_QUEUE)
                putInt(KEY_CURSOR, 0)
            }
        }
        val recent = strings(KEY_RECENT).toMutableList()
        val queue = candidates(KEY_QUEUE).toMutableList()
        val lastId = recent.lastOrNull()
        val fresh = { c: OnlineCandidate -> c.id !in recent && !config.exclusions.excludes(c) }
        // Petit catalogue déjà parcouru : les fonds récents reviennent, sauf l'actuel.
        val allowed = { c: OnlineCandidate -> c.id != lastId && !config.exclusions.excludes(c) }
        var pick = pickFrom(queue, fresh, preferDark)
        if (pick == null) {
            val refill = refill(config.queries, prefs.getInt(KEY_CURSOR, 0), random, fetch, fresh, allowed)
            if (refill != null) {
                queue.clear()
                queue += refill.first
                prefs.edit { putInt(KEY_CURSOR, refill.second) }
                pick = pickFrom(queue, allowed, preferDark)
            }
        }
        val chosen = pick ?: return null
        recent += chosen.id
        prefs.edit {
            putString(KEY_QUEUE, JSONArray(queue.map { it.toJson() }).toString())
            putString(KEY_RECENT, JSONArray(recent.takeLast(MAX_RECENT)).toString())
        }
        catalog.remember(chosen)
        chosen
    }

    /** Prochains fonds de la file (préchargés pour pouvoir changer hors ligne). */
    fun upcoming(count: Int): List<OnlineCandidate> = synchronized(LOCK) { candidates(KEY_QUEUE).take(count) }

    fun clear() = prefs.edit {
        remove(KEY_QUEUE)
        remove(KEY_CONFIG)
    }

    /** Premier fond utilisable de la file ; la nuit (rotation intelligente), un fond sombre s'il y en a. */
    private fun pickFrom(queue: MutableList<OnlineCandidate>, usable: (OnlineCandidate) -> Boolean, preferDark: Boolean): OnlineCandidate? {
        queue.retainAll(usable)
        val index = if (preferDark) queue.indexOfFirst { SmartRotation.isDark(it.color) }.takeIf { it >= 0 } ?: 0 else 0
        return if (queue.isEmpty()) null else queue.removeAt(index)
    }

    private fun strings(key: String): List<String> {
        val array = runCatching { JSONArray(prefs.getString(key, "[]")) }.getOrNull() ?: return emptyList()
        return (0 until array.length()).mapNotNull { array.optString(it).ifBlank { null } }
    }

    private fun candidates(key: String): List<OnlineCandidate> {
        val array = runCatching { JSONArray(prefs.getString(key, "[]")) }.getOrNull() ?: return emptyList()
        return (0 until array.length()).mapNotNull { OnlineCandidate.fromJson(array.optJSONObject(it)) }
    }

    companion object {
        /**
         * Nouveau lot : les sources sont interrogées chacune à son tour à partir de [cursor] ; renvoie
         * le lot (mélangé, borné) et la position de la source suivante, ou null si aucune ne répond.
         */
        fun refill(
            queries: List<OnlineQuery>,
            cursor: Int,
            random: Random,
            fetch: (OnlineQuery) -> List<OnlineCandidate>,
            fresh: (OnlineCandidate) -> Boolean,
            allowed: (OnlineCandidate) -> Boolean = fresh,
        ): Pair<List<OnlineCandidate>, Int>? {
            if (queries.isEmpty()) return null
            for (i in 0 until queries.size.coerceAtMost(MAX_ATTEMPTS)) {
                val index = (cursor + i) % queries.size
                val fetched = runCatching { fetch(queries[index]) }.getOrDefault(emptyList()).distinctBy { it.id }
                val batch = fetched.filter(fresh).ifEmpty { fetched.filter(allowed) }.shuffled(random)
                if (batch.isNotEmpty()) return batch.take(BATCH) to (index + 1) % queries.size
            }
            return null
        }

        private val LOCK = Any()
        private const val KEY_CONFIG = "config"
        private const val KEY_QUEUE = "queue"
        private const val KEY_RECENT = "recent"
        private const val KEY_CURSOR = "cursor"
        /** Fonds gardés par lot : les sources alternent souvent, le quota d'API reste modeste. */
        private const val BATCH = 10
        private const val MAX_RECENT = 300
        private const val MAX_ATTEMPTS = 6

        fun metered(context: Context): Boolean =
            context.getSystemService(ConnectivityManager::class.java)?.isActiveNetworkMetered ?: false
    }
}
