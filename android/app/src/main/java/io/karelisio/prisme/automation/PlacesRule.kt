package io.karelisio.prisme.automation

import android.content.Context
import androidx.core.content.edit
import io.karelisio.prisme.system.ErrorLog
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/** Point de la Terre, en degrés. */
data class GeoPoint(val latitude: Double, val longitude: Double)

/** Dernier lieu retenu ([PlaceConfig.key]) et l'instant où une position l'a confirmé. */
data class PlaceMemory(val key: String? = null, val at: Long = 0)

/** Résultat d'un contrôle : le lieu retenu (null : aucun) et la mémoire à enregistrer. */
data class PlaceCheck(val place: PlaceConfig?, val memory: PlaceMemory)

/** Logique pure des lieux (distance, choix du lieu, mémoire), testée sur JVM. */
internal object Places {
    /** On reste « dans » un lieu jusqu'à ce multiple de son rayon : pas de va-et-vient en bordure de zone. */
    const val EXIT_FACTOR = 1.25

    /** Sans position, le lieu retenu est gardé ce temps au plus (GPS sans signal, localisation coupée) ; au-delà, on l'oublie. */
    const val MEMORY_MAX_AGE_MS = 3 * 60 * 60_000L

    private const val EARTH_RADIUS_METERS = 6_371_008.8

    /** Distance en mètres entre deux points, par la formule de haversine. */
    fun distanceMeters(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val a = sin(dLat / 2).pow(2) + cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLon / 2).pow(2)
        return 2 * EARTH_RADIUS_METERS * asin(sqrt(a.coerceIn(0.0, 1.0)))
    }

    /**
     * Premier lieu de la liste dont la zone contient la position. Le lieu où l'on était déjà
     * ([currentKey]) garde une zone élargie de [EXIT_FACTOR] : on n'en sort pas à la moindre dérive du GPS.
     */
    fun choose(items: List<PlaceConfig>, position: GeoPoint, currentKey: String?): PlaceConfig? = items.firstOrNull { place ->
        val reach = if (place.key == currentKey) place.radius * EXIT_FACTOR else place.radius
        distanceMeters(position.latitude, position.longitude, place.latitude, place.longitude) <= reach
    }

    /** Lieu mémorisé s'il existe encore dans la configuration et qu'une position l'a confirmé il y a peu. */
    fun remembered(items: List<PlaceConfig>, memory: PlaceMemory, now: Long): PlaceConfig? {
        val key = memory.key ?: return null
        if (now - memory.at !in 0..MEMORY_MAX_AGE_MS) return null
        return items.firstOrNull { it.key == key }
    }

    /**
     * Contrôle d'après la position. Sans position (rien trouvé à temps), on garde le lieu mémorisé un
     * moment plutôt que de rendre le fond habituel pour le reposer au contrôle suivant.
     */
    fun check(items: List<PlaceConfig>, position: GeoPoint?, memory: PlaceMemory, now: Long): PlaceCheck {
        val held = remembered(items, memory, now)
        if (position == null) return PlaceCheck(held, memory)
        val place = choose(items, position, held?.key)
        return PlaceCheck(place, PlaceMemory(place?.key, now))
    }
}

/**
 * « Selon le lieu » : fond du premier lieu dont la zone contient l'appareil, prioritaire sur les fonds
 * dynamiques et la rotation. Sans autorisation, la règle ne dit rien ; sans position, elle garde un moment
 * le lieu retenu (voir [Places.check]). Jamais d'erreur : le reste des automatismes continue.
 */
internal object PlacesRule {
    fun compute(context: Context, config: AutomationConfig, moment: Moment): Override? {
        val places = config.places
        // Le mode focus passe avant : inutile de chercher la position pendant ses plages.
        if (!places.active || RulesEngine.focusActive(config.focus, moment)) return null
        val store = PlaceMemoryStore(context)
        if (!PlaceLocator.allowed(context)) {
            store.forget()
            return null
        }
        val position = try {
            PlaceLocator.locate(context)?.let { GeoPoint(it.latitude, it.longitude) }
        } catch (e: Exception) {
            // Imprévu : gardé dans le journal du Diagnostic, sans bloquer les autres automatismes.
            ErrorLog.record(context, "Lieux", e)
            null
        }
        val check = Places.check(places.items, position, store.load(), moment.epochMillis)
        if (position != null) store.save(check.memory)
        return check.place?.let { Override(it.ref, places.target, Reason.PLACE) }
    }
}

/** Mémoire des allées et venues, dans des SharedPreferences à part (la configuration, elle, est réécrite par l'app). */
internal class PlaceMemoryStore(context: Context) {
    private val prefs = context.getSharedPreferences("prisme_places", Context.MODE_PRIVATE)

    fun load() = PlaceMemory(prefs.getString(KEY_PLACE, null), prefs.getLong(KEY_AT, 0))

    fun save(memory: PlaceMemory) = prefs.edit {
        if (memory.key == null) remove(KEY_PLACE) else putString(KEY_PLACE, memory.key)
        putLong(KEY_AT, memory.at)
    }

    fun forget() {
        if (prefs.contains(KEY_PLACE)) prefs.edit { remove(KEY_PLACE) }
    }

    private companion object {
        const val KEY_PLACE = "place"
        const val KEY_AT = "at"
    }
}
