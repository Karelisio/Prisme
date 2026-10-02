package io.karelisio.prisme.automation

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.CancellationSignal
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import androidx.core.content.ContextCompat
import androidx.core.location.LocationListenerCompat
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Position de l'appareil pour « Selon le lieu », avec le seul LocationManager (pas de services
 * Google). Les fonctions qui lisent la position supposent les autorisations déjà vérifiées.
 */
internal object PlaceLocator {
    /** Délai maximal d'une position fraîche. */
    const val FIX_TIMEOUT_MS = 20_000L

    /** Au-delà, la dernière position connue ne dit plus où l'on est. */
    private const val LAST_KNOWN_MAX_AGE_MS = 20 * 60_000L

    /** Précision (en mètres) qui suffit pour arrêter de chercher, et précision au-delà de laquelle la position est écartée. */
    private const val GOOD_ACCURACY_M = 100f
    private const val MAX_ACCURACY_M = 1_000f

    /** Fournisseurs interrogés ; « fused » n'existe que sur les appareils qui l'exposent. */
    private val PROVIDERS = setOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, "fused")

    fun hasPrecise(context: Context): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

    /** « Toujours autoriser » (Android 10+) : sans lui, la position n'est pas lue app fermée. Avant Android 10, inutile. */
    fun hasBackground(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < 29) return true
        return ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED
    }

    /** Les deux autorisations sont accordées : la tâche de fond peut lire la position. */
    fun allowed(context: Context): Boolean = hasPrecise(context) && hasBackground(context)

    /**
     * Position pour la tâche de fond (jamais appelée depuis le fil principal) : la dernière position
     * connue si elle est récente, sinon une position fraîche ; null si rien n'est trouvé à temps.
     */
    fun locate(context: Context): Location? {
        val manager = context.getSystemService(LocationManager::class.java) ?: return null
        return lastKnown(manager) ?: freshBlocking(context)
    }

    /**
     * Position la plus récente de tous les fournisseurs actifs : GPS, réseau, « fused » s'il est exposé et
     * « passive » (positions obtenues par d'autres applis).
     */
    @SuppressLint("MissingPermission")
    private fun lastKnown(manager: LocationManager): Location? {
        val now = SystemClock.elapsedRealtimeNanos()
        val maxAgeNanos = LAST_KNOWN_MAX_AGE_MS * 1_000_000L
        return try {
            manager.getProviders(true)
                .mapNotNull { manager.getLastKnownLocation(it) }
                .filter { usable(it) && now - it.elapsedRealtimeNanos in 0L..maxAgeNanos }
                .maxByOrNull { it.elapsedRealtimeNanos }
        } catch (e: SecurityException) {
            null
        }
    }

    private fun freshBlocking(context: Context): Location? {
        // Les résultats arrivent sur le fil principal : l'attendre depuis lui le bloquerait pour rien.
        if (Looper.myLooper() == Looper.getMainLooper()) return null
        val latch = CountDownLatch(1)
        var found: Location? = null
        fresh(context, FIX_TIMEOUT_MS) {
            found = it
            latch.countDown()
        }
        latch.await(FIX_TIMEOUT_MS + 5_000L, TimeUnit.MILLISECONDS)
        return found
    }

    /**
     * Position fraîche : interroge ensemble les fournisseurs actifs (GPS, réseau, « fused ») et garde la
     * plus précise, dès qu'une est assez bonne ou au bout de [timeoutMs]. [onDone] est appelé une seule
     * fois, sur le fil principal (null : rien trouvé, ou rien d'assez précis).
     */
    fun fresh(context: Context, timeoutMs: Long, onDone: (Location?) -> Unit) {
        val app = context.applicationContext
        val handler = Handler(Looper.getMainLooper())
        handler.post { request(app, handler, timeoutMs, onDone) }
    }

    @SuppressLint("MissingPermission")
    private fun request(context: Context, handler: Handler, timeoutMs: Long, onDone: (Location?) -> Unit) {
        val manager = context.getSystemService(LocationManager::class.java)
        val providers = manager?.getProviders(true)?.filter { it in PROVIDERS }.orEmpty()
        if (manager == null || providers.isEmpty()) {
            onDone(null)
            return
        }
        val signal = CancellationSignal()
        val listeners = mutableListOf<LocationListenerCompat>()
        val answered = mutableSetOf<String>()
        var best: Location? = null
        var finished = false

        fun finish() {
            if (finished) return
            finished = true
            handler.removeCallbacksAndMessages(null)
            signal.cancel()
            listeners.forEach { manager.removeUpdates(it) }
            onDone(best)
        }

        fun offer(provider: String, location: Location?) {
            if (finished || !answered.add(provider)) return
            val current = best
            if (location != null && usable(location) && (current == null || accuracy(location) < accuracy(current))) best = location
            val enough = best?.let { it.hasAccuracy() && it.accuracy <= GOOD_ACCURACY_M } == true
            if (enough || answered.size >= providers.size) finish()
        }

        handler.postDelayed({ finish() }, timeoutMs)
        for (provider in providers) {
            if (finished) break
            try {
                if (Build.VERSION.SDK_INT >= 30) {
                    manager.getCurrentLocation(provider, signal, ContextCompat.getMainExecutor(context)) { offer(provider, it) }
                } else {
                    val listener = object : LocationListenerCompat {
                        override fun onLocationChanged(location: Location) = offer(provider, location)

                        override fun onProviderDisabled(disabled: String) = offer(provider, null)
                    }
                    listeners += listener
                    @Suppress("DEPRECATION")
                    manager.requestSingleUpdate(provider, listener, Looper.getMainLooper())
                }
            } catch (e: RuntimeException) {
                // Autorisation retirée entre-temps, fournisseur disparu : celui-là n'apportera rien.
                offer(provider, null)
            }
        }
    }

    private fun usable(location: Location) = !location.hasAccuracy() || location.accuracy <= MAX_ACCURACY_M

    private fun accuracy(location: Location) = if (location.hasAccuracy()) location.accuracy else Float.MAX_VALUE
}
