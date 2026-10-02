package io.karelisio.prisme.live

import android.content.Context
import android.content.SharedPreferences
import android.media.MediaPlayer
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.service.wallpaper.WallpaperService
import android.view.Surface
import android.view.SurfaceHolder
import io.karelisio.prisme.system.ErrorLog
import java.io.FileInputStream

/**
 * Fond vidéo Prisme : la vidéo choisie dans la galerie ([MediaKind.VIDEO]), en boucle et sans le son, lue par
 * MediaPlayer sur la surface du fond d'écran.
 *
 * C'est un service à part de [ParallaxWallpaperService] : une surface qui a servi au canevas (lockCanvas) reste
 * connectée à ce producteur et MediaPlayer ne peut plus s'y connecter (« already connected »), et inversement.
 * La vidéo ne peut donc pas partager le moteur des scènes. Ici, rien n'est jamais dessiné sur la surface.
 *
 * La lecture n'a lieu que si le fond est visible et pas en pause (économie d'énergie, comme les scènes) ; sinon
 * la vidéo est en pause et la dernière image reste affichée.
 */
class VideoWallpaperService : WallpaperService() {
    override fun onCreateEngine(): Engine = VideoEngine()

    private inner class VideoEngine : Engine() {
        private val context: Context get() = this@VideoWallpaperService
        private val prefs = LiveWallpaperStore.prefs(this@VideoWallpaperService)
        private val handler = Handler(Looper.getMainLooper())
        private val eco = EcoMonitor(this@VideoWallpaperService) { updateRunning() }
        private var holder: SurfaceHolder? = null
        private var visible = false
        private var running = false

        // Lecteur de la vidéo ouverte ; `started` : une image a déjà été montrée (lecture ou première image).
        private var player: MediaPlayer? = null
        private var prepared = false
        private var started = false

        // Échecs d'ouverture ou de lecture de suite : chaque nouvel essai attend un peu plus longtemps, et après
        // [MAX_FAILURES] la vidéo est abandonnée jusqu'à un autre choix (ou jusqu'au prochain démarrage du fond).
        private var failures = 0
        private var failedStamp = NO_STAMP
        private var nextAttemptAt = 0L

        private val prefsListener = SharedPreferences.OnSharedPreferenceChangeListener { _, key ->
            when (key) {
                LiveWallpaperStore.KEY_ECO -> updateRunning()
                LiveWallpaperStore.KEY_MEDIA_VIDEO -> reload()
            }
        }

        override fun onCreate(surfaceHolder: SurfaceHolder) {
            super.onCreate(surfaceHolder)
            prefs.registerOnSharedPreferenceChangeListener(prefsListener)
            eco.start()
        }

        override fun onDestroy() {
            prefs.unregisterOnSharedPreferenceChangeListener(prefsListener)
            eco.stop()
            handler.removeCallbacksAndMessages(null)
            closePlayer()
            super.onDestroy()
        }

        override fun onSurfaceCreated(holder: SurfaceHolder) {
            super.onSurfaceCreated(holder)
            this.holder = holder
            updateRunning()
        }

        override fun onSurfaceChanged(holder: SurfaceHolder, format: Int, w: Int, h: Int) {
            super.onSurfaceChanged(holder, format, w, h)
            this.holder = holder
            updateRunning()
        }

        override fun onSurfaceDestroyed(holder: SurfaceHolder) {
            this.holder = null
            // La surface disparaît : le lecteur ne doit plus y écrire. Il est rouvert sur la suivante.
            closePlayer()
            updateRunning()
            super.onSurfaceDestroyed(holder)
        }

        override fun onVisibilityChanged(isVisible: Boolean) {
            visible = isVisible
            updateRunning()
        }

        /** Nouvelle vidéo choisie dans l'app : l'ancienne est fermée, la nouvelle s'ouvre si le fond est visible. */
        private fun reload() {
            failures = 0
            failedStamp = NO_STAMP
            nextAttemptAt = 0L
            closePlayer()
            updateRunning()
        }

        /** La vidéo joue : fond visible, surface prête et pas de pause en économie de batterie. Sinon, pause sur la dernière image. */
        private fun updateRunning() {
            val paused = LiveWallpaperStore.read(context).eco && eco.lowPower
            running = visible && surface() != null && !paused
            if (visible) openIfNeeded()
            syncPlayback()
        }

        private fun surface(): Surface? = holder?.surface?.takeIf { it.isValid }

        private fun openIfNeeded() {
            if (player != null) return
            val surface = surface() ?: return
            val info = LiveMedia.ready(context, MediaKind.VIDEO) ?: return
            if (info.stamp == failedStamp || SystemClock.uptimeMillis() < nextAttemptAt) return
            val next = MediaPlayer()
            try {
                next.setSurface(surface)
                FileInputStream(LiveMedia.file(context, info)).use { next.setDataSource(it.fd) }
                next.isLooping = true
                // Pas de son, et le fond ne prend jamais le focus audio (MediaPlayer ne le demande pas de lui-même).
                next.setVolume(0f, 0f)
                fitToScreen(next)
                next.setOnPreparedListener { onPrepared(it) }
                next.setOnErrorListener { failed, what, extra -> onError(failed, info, what, extra) }
                next.prepareAsync()
            } catch (e: Exception) {
                runCatching { next.release() }
                fail(info, e)
                return
            }
            player = next
            prepared = false
            started = false
        }

        private fun onPrepared(ready: MediaPlayer) {
            if (ready !== player) return
            prepared = true
            failures = 0
            failedStamp = NO_STAMP
            nextAttemptAt = 0L
            // Redemandés une fois le lecteur prêt : certains appareils ne prennent en compte le recadrage qu'à ce moment.
            fitToScreen(ready)
            ready.setVolume(0f, 0f)
            syncPlayback()
        }

        /** La vidéo remplit tout l'écran, centrée ; ce qui dépasse est recadré (comme l'ajustement des scènes). */
        private fun fitToScreen(target: MediaPlayer) {
            try {
                target.setVideoScalingMode(MediaPlayer.VIDEO_SCALING_MODE_SCALE_TO_FIT_WITH_CROPPING)
            } catch (e: RuntimeException) {
                // Sans effet sur la lecture : la vidéo reste entière, avec des bandes.
            }
        }

        /** Lecture ou pause du lecteur prêt, selon [running]. */
        private fun syncPlayback() {
            val current = player ?: return
            if (!prepared) return
            try {
                if (running) {
                    if (!current.isPlaying) current.start()
                    started = true
                } else if (current.isPlaying) {
                    current.pause()
                } else if (!started) {
                    // Jamais lancée : la première image est montrée quand même (fond en pause dès le départ).
                    showFirstFrame(current)
                    started = true
                }
            } catch (e: IllegalStateException) {
                // Lecteur tombé en erreur entre-temps : onError s'en charge, ou la prochaine ouverture.
            }
        }

        private fun showFirstFrame(current: MediaPlayer) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) current.seekTo(0L, MediaPlayer.SEEK_CLOSEST) else current.seekTo(0)
        }

        /** Erreur du lecteur : il est fermé, jamais de plantage ; une nouvelle ouverture est tentée peu après (voir [fail]). */
        private fun onError(failed: MediaPlayer, info: MediaInfo, what: Int, extra: Int): Boolean {
            if (failed !== player) return true
            closePlayer()
            fail(info, IllegalStateException("MediaPlayer : erreur $what ($extra)"))
            return true
        }

        /**
         * Ouverture ou lecture en échec : l'erreur va au journal (les premières fois seulement) et un nouvel essai a
         * lieu, de plus en plus tard, tant que le fond est à l'écran ; au bout de [MAX_FAILURES], la vidéo est
         * abandonnée (fond noir) jusqu'à un autre choix. Un échec passager (décodeur occupé) se rattrape ainsi.
         */
        private fun fail(info: MediaInfo, error: Throwable) {
            failures++
            if (failures <= MAX_FAILURES) ErrorLog.record(context, "Fond vidéo", error)
            if (failures >= MAX_FAILURES) {
                failedStamp = info.stamp
                return
            }
            val delay = RETRY_STEP_MS * failures
            nextAttemptAt = SystemClock.uptimeMillis() + delay
            if (visible) handler.postDelayed({ updateRunning() }, delay)
        }

        private fun closePlayer() {
            val current = player ?: return
            player = null
            prepared = false
            started = false
            current.setOnPreparedListener(null)
            current.setOnErrorListener(null)
            runCatching { current.release() }
        }
    }

    private companion object {
        const val NO_STAMP = Long.MIN_VALUE

        /** Échecs de suite après lesquels la vidéo n'est plus rouverte (jusqu'à un autre choix). */
        const val MAX_FAILURES = 3

        /** Attente avant le nouvel essai : une fois ce délai après le premier échec, deux fois après le deuxième. */
        const val RETRY_STEP_MS = 1_000L
    }
}
