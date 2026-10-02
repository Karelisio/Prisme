package io.karelisio.prisme.music

import android.content.ComponentName
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.service.notification.NotificationListenerService
import io.karelisio.prisme.system.ErrorLog
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.lang.ref.WeakReference

/**
 * Écoute les sessions média de n'importe quelle appli de musique (Android ne les montre qu'aux applis
 * autorisées à lire les notifications ; aucune notification n'est lue ici). Un changement de morceau
 * ou d'état de lecture, regroupé sur [MusicRules.EVENT_DELAY_MS], pose la pochette ; une lecture
 * arrêtée depuis [MusicRules.RESTORE_DELAY_MS] fait revenir le fond précédent. Rien ne se passe tant
 * que l'option est coupée.
 */
class MusicListenerService : NotificationListenerService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val mainHandler = Handler(Looper.getMainLooper())

    /** Un seul calcul de pochette à la fois : une image d'écran composée pèse plusieurs mégaoctets. */
    private val work = Mutex()
    private var evaluateJob: Job? = null
    private var restoreJob: Job? = null

    /** Début de la rafale d'événements en attente (voir [evaluateSoon]). */
    private var burstStart = 0L
    private var waiting = false

    /** Morceau dont la pochette n'a pas pu être posée : inutile de réessayer à chaque événement, le suivant aura sa chance. */
    private var failedKey: String? = null
    private var sessionManager: MediaSessionManager? = null
    private var sessionsListener: MediaSessionManager.OnActiveSessionsChangedListener? = null

    /** Sessions suivies, de la plus prioritaire à la moins prioritaire, chacune avec [callback] enregistré. */
    private var sessions: List<MediaController> = emptyList()

    private val callback = object : MediaController.Callback() {
        override fun onMetadataChanged(metadata: MediaMetadata?) = evaluateSoon()
        override fun onPlaybackStateChanged(state: PlaybackState?) = evaluateSoon()
        override fun onSessionDestroyed() = evaluateSoon()
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        instance = WeakReference(this)
        release()
        val manager = getSystemService(MediaSessionManager::class.java) ?: return
        val component = ComponentName(this, MusicListenerService::class.java)
        val listener = MediaSessionManager.OnActiveSessionsChangedListener { controllers ->
            track(controllers.orEmpty())
            evaluateSoon()
        }
        try {
            manager.addOnActiveSessionsChangedListener(listener, component, mainHandler)
            sessionManager = manager
            sessionsListener = listener
            track(manager.getActiveSessions(component))
        } catch (e: SecurityException) {
            // Accès retiré entre la connexion et maintenant : onListenerDisconnected suit.
            return
        } catch (e: RuntimeException) {
            // Une session média défaillante ne doit pas faire tomber l'app : gardé dans le journal.
            ErrorLog.record(applicationContext, "Pochette", e)
            return
        }
        evaluateSoon()
    }

    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        release()
        forget()
        // Accès retiré pendant l'affichage : plus personne ne dira quand la musique s'arrête.
        if (!MusicArtwork.accessGranted(this)) {
            scope.launch { guarded { withContext(Dispatchers.IO) { MusicArtwork.finish(applicationContext) } } }
        }
    }

    override fun onDestroy() {
        release()
        forget()
        scope.cancel()
        super.onDestroy()
    }

    /** Retire la référence statique de [refresh] si elle désigne ce service. */
    private fun forget() {
        if (instance?.get() === this) instance = null
    }

    private fun release() {
        evaluateJob?.cancel()
        waiting = false
        restoreJob?.cancel()
        sessions.forEach { runCatching { it.unregisterCallback(callback) } }
        sessions = emptyList()
        sessionsListener?.let { listener -> runCatching { sessionManager?.removeOnActiveSessionsChangedListener(listener) } }
        sessionsListener = null
        sessionManager = null
    }

    /** getActiveSessions renvoie de nouveaux objets à chaque appel : on reconnaît une session à son jeton. */
    private fun track(next: List<MediaController>) {
        val previous = sessions
        val merged = next.map { fresh ->
            previous.firstOrNull { it.sessionToken == fresh.sessionToken } ?: fresh.also { runCatching { it.registerCallback(callback, mainHandler) } }
        }
        previous.filter { old -> merged.none { it === old } }.forEach { runCatching { it.unregisterCallback(callback) } }
        sessions = merged
    }

    /** Regroupe les événements : on ne relit l'état qu'une fois la rafale terminée (ou au bout de [MusicRules.BURST_MAX_MS]). */
    private fun evaluateSoon(delayMs: Long = MusicRules.EVENT_DELAY_MS) {
        val now = SystemClock.elapsedRealtime()
        if (!waiting) burstStart = now
        val wait = MusicRules.evaluationWait(delayMs, now - burstStart)
        // Une relecture déjà en cours va jusqu'au bout ; la suivante attend son tour (verrou de calcul).
        if (waiting) evaluateJob?.cancel()
        waiting = true
        evaluateJob = scope.launch {
            delay(wait)
            waiting = false
            guarded { evaluate() }
        }
    }

    private suspend fun evaluate() {
        val context = applicationContext
        val state = MusicState(context)
        if (!state.enabled) {
            // Option coupée : rien à faire (le fond précédent est rendu au moment où on la coupe).
            restoreJob?.cancel()
            return
        }
        val playing = sessions.firstOrNull { MusicRules.isActive(it.playbackState?.state) }
        if (playing == null) {
            scheduleRestore(state)
            return
        }
        restoreJob?.cancel()
        if (state.pausedSince != 0L) state.pausedSince = 0L
        val metadata = playing.metadata ?: return
        val key = MusicRules.trackKey(
            metadata.getText(MediaMetadata.METADATA_KEY_TITLE) ?: metadata.getText(MediaMetadata.METADATA_KEY_DISPLAY_TITLE),
            metadata.getText(MediaMetadata.METADATA_KEY_ARTIST) ?: metadata.getText(MediaMetadata.METADATA_KEY_ALBUM_ARTIST),
            metadata.getText(MediaMetadata.METADATA_KEY_ALBUM),
        ) ?: return
        if (key == failedKey || !MusicRules.shouldApply(enabled = true, playing = true, key = key, lastKey = state.lastKey)) return
        work.withLock {
            // Le chargement peut passer par le réseau ; pas d'image exploitable : on ne fait rien.
            val art = withContext(Dispatchers.IO) { ArtworkSource.load(context, metadata) } ?: return@withLock
            try {
                withContext(Dispatchers.Default) { MusicArtwork.show(context, key, art) }
            } catch (e: Throwable) {
                if (e !is CancellationException) failedKey = key
                throw e
            }
        }
    }

    /** Lecture arrêtée : le fond précédent revient une minute plus tard, sauf si la musique reprend. */
    private fun scheduleRestore(state: MusicState) {
        restoreJob?.cancel()
        if (!state.showing) return
        val now = System.currentTimeMillis()
        // Gardé sur disque : si le processus est tué entre-temps, le retour reste dû à la reconnexion.
        if (state.pausedSince == 0L) state.pausedSince = now
        val wait = MusicRules.restoreDelay(state.pausedSince, now)
        restoreJob = scope.launch {
            delay(wait)
            if (sessions.any { MusicRules.isActive(it.playbackState?.state) }) return@launch
            guarded { withContext(Dispatchers.IO) { MusicArtwork.finish(applicationContext) } }
        }
    }

    /** Une erreur ne doit pas arrêter l'écoute : elle est gardée dans le journal (Réglages › Diagnostic). */
    private suspend fun guarded(block: suspend () -> Unit) {
        try {
            block()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            record(e)
        } catch (e: OutOfMemoryError) {
            record(e)
        }
    }

    private suspend fun record(error: Throwable) {
        withContext(Dispatchers.IO) { ErrorLog.record(applicationContext, "Pochette", error) }
    }

    companion object {
        private const val REFRESH_DELAY_MS = 300L

        @Volatile
        private var instance: WeakReference<MusicListenerService>? = null

        /** Fait relire l'état de la lecture tout de suite (option activée ou écran changé dans l'app), échec précédent oublié. */
        fun refresh() {
            val service = instance?.get() ?: return
            service.scope.launch {
                service.failedKey = null
                service.evaluateSoon(REFRESH_DELAY_MS)
            }
        }
    }
}
