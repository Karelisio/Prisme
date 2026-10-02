package io.karelisio.prisme.automation

import android.content.Context
import androidx.core.content.edit
import io.karelisio.prisme.wallpaper.WallpaperRef
import io.karelisio.prisme.wallpaper.WallpaperTarget
import org.json.JSONObject
import java.util.Locale
import kotlin.random.Random

/**
 * Fête ou date perso : jours concernés (« AAAA-MM-JJ », calculés par l'app pour cette année et la
 * suivante), avec un fond choisi ou un thème cherché en ligne le jour venu.
 */
data class EventConfig(
    val id: String,
    val name: String,
    val dates: Set<String>,
    val ref: WallpaperRef? = null,
    val queries: List<OnlineQuery> = emptyList(),
)

data class EventsConfig(
    val enabled: Boolean = false,
    val target: WallpaperTarget = WallpaperTarget.BOTH,
    val items: List<EventConfig> = emptyList(),
) {
    companion object {
        fun fromJson(json: JSONObject?): EventsConfig {
            if (json == null) return EventsConfig()
            val array = json.optJSONArray("items")
            val items = (0 until (array?.length() ?: 0)).mapNotNull { i ->
                val e = array?.optJSONObject(i) ?: return@mapNotNull null
                val dates = e.optJSONArray("dates")?.let { d -> (0 until d.length()).mapNotNull { d.optString(it).ifBlank { null } } }.orEmpty()
                val queries = e.optJSONArray("queries")?.let { q -> (0 until q.length()).mapNotNull { q.optJSONObject(it)?.let(OnlineQuery::fromJson) } }.orEmpty()
                val ref = WallpaperRef.fromJson(e.optJSONObject("item"))
                if (dates.isEmpty() || (ref == null && queries.isEmpty())) null
                else EventConfig(e.optString("id"), e.optString("name"), dates.toSet(), ref, queries)
            }
            return EventsConfig(
                enabled = json.optBoolean("enabled"),
                target = WallpaperTarget.fromKey(json.optString("target")) ?: WallpaperTarget.BOTH,
                items = items,
            )
        }
    }
}

/** Règle « fêtes et dates perso » : le premier événement du jour l'emporte. */
internal object EventsRule {
    fun today(moment: Moment): String = String.format(Locale.ROOT, "%04d-%02d-%02d", moment.year, moment.month, moment.dayOfMonth)

    /** Événement du jour (logique pure). */
    fun active(config: EventsConfig, moment: Moment): EventConfig? {
        if (!config.enabled) return null
        val day = today(moment)
        return config.items.firstOrNull { day in it.dates }
    }

    /**
     * Fond de l'événement du jour : le fond choisi, sinon un fond du thème trouvé en ligne une fois
     * pour la journée (mémorisé) ; null s'il n'y a rien aujourd'hui ou si aucune source ne répond.
     */
    fun pick(context: Context, config: EventsConfig, moment: Moment): Override? {
        val event = active(config, moment) ?: return null
        event.ref?.let { return Override(it, config.target, Reason.EVENT) }
        val key = "${today(moment)}|${event.id}"
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val cached = prefs.getString(KEY_DAY, null)?.takeIf { it == key }?.let {
            OnlineCandidate.fromJson(prefs.getString(KEY_CANDIDATE, null)?.let { raw -> runCatching { JSONObject(raw) }.getOrNull() })
        }
        val candidate = cached ?: fetch(context, event)?.also { found ->
            prefs.edit {
                putString(KEY_DAY, key)
                putString(KEY_CANDIDATE, found.toJson().toString())
            }
        } ?: return null
        OnlineCatalog(context).remember(candidate)
        return Override(candidate.ref(), config.target, Reason.EVENT)
    }

    /** Image en ligne retenue pour aujourd'hui (à garder lors du ménage des fichiers). */
    fun cachedRef(context: Context, moment: Moment): WallpaperRef? {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (prefs.getString(KEY_DAY, null)?.startsWith(today(moment)) != true) return null
        return OnlineCandidate.fromJson(prefs.getString(KEY_CANDIDATE, null)?.let { runCatching { JSONObject(it) }.getOrNull() })?.ref()
    }

    private fun fetch(context: Context, event: EventConfig): OnlineCandidate? {
        val size = io.karelisio.prisme.wallpaper.ScreenInfo.read(context, null)
        val screen = OnlineSources.Screen(size.width, size.height)
        val random = Random.Default
        val batch = OnlineQueue.refill(event.queries, random.nextInt(event.queries.size), random, { OnlineSources.fetch(it, random, screen) }, { true })
        return batch?.first?.firstOrNull()
    }

    private const val PREFS = "prisme_events"
    private const val KEY_DAY = "day"
    private const val KEY_CANDIDATE = "candidate"
}
