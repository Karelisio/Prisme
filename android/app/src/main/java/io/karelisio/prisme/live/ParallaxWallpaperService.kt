package io.karelisio.prisme.live

import android.app.WallpaperManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.SharedPreferences
import android.os.Bundle
import android.os.SystemClock
import android.service.wallpaper.WallpaperService
import android.view.MotionEvent
import android.view.SurfaceHolder
import androidx.core.content.ContextCompat
import kotlin.random.Random

/**
 * Fond animé Prisme (le nom de la classe est gardé : le changer désactiverait le fond des utilisateurs).
 * Le moteur affiche la scène du genre choisi ([LiveMode]) et gère ce qui est commun à toutes :
 * visibilité, pause en économie de batterie, double-tap sur l'écran d'accueil et changement d'image à
 * chaque déverrouillage (liste préparée par l'app).
 */
class ParallaxWallpaperService : WallpaperService() {
    override fun onCreateEngine(): Engine = LiveEngine()

    private inner class LiveEngine : Engine() {
        private val context: Context get() = this@ParallaxWallpaperService
        private val prefs = LiveWallpaperStore.prefs(this@ParallaxWallpaperService)
        private var mode = LiveWallpaperStore.read(this@ParallaxWallpaperService).mode
        private var scene: LiveScene = LiveScenes.create(this@ParallaxWallpaperService, mode)
        private var holder: SurfaceHolder? = null
        private var width = 0
        private var height = 0
        private var visible = false
        private val eco = EcoMonitor(this@ParallaxWallpaperService) { updateRunning() }
        private val doubleTap = DoubleTapDetector(maxDistancePx = DOUBLE_TAP_SLOP_DP * resources.displayMetrics.density)

        private val prefsListener = SharedPreferences.OnSharedPreferenceChangeListener { _, key ->
            when (key) {
                LiveWallpaperStore.KEY_COUNTER, LiveWallpaperStore.KEY_DOUBLE_TAP -> Unit
                LiveWallpaperStore.KEY_MODE -> switchMode()
                LiveWallpaperStore.KEY_ECO -> updateRunning()
                else -> {
                    scene.onSettingsChanged()
                    (scene as? CanvasScene)?.overlay?.onSettingsChanged()
                }
            }
        }

        private val unlockReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) = onUnlock()
        }
        private var unlockRegistered = false

        override fun onCreate(surfaceHolder: SurfaceHolder) {
            super.onCreate(surfaceHolder)
            prefs.registerOnSharedPreferenceChangeListener(prefsListener)
            // « Exporté » ne laisse entrer personne : seul le système peut envoyer cette diffusion protégée. Si
            // l'enregistrement échoue, le fond s'affiche quand même, sans changement au déverrouillage.
            unlockRegistered = runCatching {
                ContextCompat.registerReceiver(context, unlockReceiver, IntentFilter(Intent.ACTION_USER_PRESENT), ContextCompat.RECEIVER_EXPORTED)
            }.isSuccess
            eco.start()
            prepareScene()
        }

        override fun onDestroy() {
            prefs.unregisterOnSharedPreferenceChangeListener(prefsListener)
            if (unlockRegistered) runCatching { unregisterReceiver(unlockReceiver) }
            unlockRegistered = false
            eco.stop()
            scene.release()
            super.onDestroy()
        }

        override fun onSurfaceChanged(holder: SurfaceHolder, format: Int, w: Int, h: Int) {
            super.onSurfaceChanged(holder, format, w, h)
            this.holder = holder
            width = w
            height = h
            scene.onSurface(holder, w, h)
            updateRunning()
        }

        override fun onSurfaceDestroyed(holder: SurfaceHolder) {
            this.holder = null
            updateRunning()
            scene.onSurfaceDestroyed()
            super.onSurfaceDestroyed(holder)
        }

        override fun onVisibilityChanged(isVisible: Boolean) {
            visible = isVisible
            updateRunning()
        }

        override fun onTouchEvent(event: MotionEvent) {
            if (scene.wantsTouch) scene.onTouch(event)
            super.onTouchEvent(event)
        }

        /** Le lanceur transmet les touchers dans les zones vides de l'écran d'accueil. */
        override fun onCommand(action: String?, x: Int, y: Int, z: Int, extras: Bundle?, resultRequested: Boolean): Bundle? {
            if (action == WallpaperManager.COMMAND_TAP && LiveWallpaperStore.read(context).doubleTap &&
                doubleTap.onTap(SystemClock.uptimeMillis(), x.toFloat(), y.toFloat())
            ) {
                onDoubleTap()
            }
            return super.onCommand(action, x, y, z, extras, resultRequested)
        }

        /** La scène avance : visible, surface prête et pas de pause en économie de batterie. */
        private fun updateRunning() {
            val paused = LiveWallpaperStore.read(context).eco && eco.lowPower
            scene.onRunning(visible && holder != null && !paused)
        }

        private fun prepareScene() {
            (scene as? CanvasScene)?.overlay = LiveScenes.overlay(context, mode)
            setTouchEventsEnabled(scene.wantsTouch)
        }

        /** Autre genre choisi dans l'app : la scène est remplacée sur la même surface. */
        private fun switchMode() {
            val newMode = LiveWallpaperStore.read(context).mode
            if (newMode == mode) return
            // La vidéo est lue par un autre service (VideoWallpaperService) : la choisir dans l'app ne doit pas
            // remplacer ici la scène en cours (GIF, photo…) tant que ce fond n'est pas activé.
            if (LiveComponent.forMode(newMode) != LiveComponent.SCENES) return
            scene.onRunning(false)
            scene.release()
            mode = newMode
            scene = LiveScenes.create(context, newMode)
            prepareScene()
            holder?.let { scene.onSurface(it, width, height) }
            updateRunning()
        }

        /** Double-tap : la scène réagit (nouvelle palette…), sinon l'image suivante de la liste. */
        private fun onDoubleTap() {
            if (scene.onDoubleTap()) return
            val playlist = LiveWallpaperStore.read(context).playlist
            if (!playlist.active) return
            LiveWallpaperStore.saveChange(context, UnlockPlaylist.nextIndex(playlist.paths.size, playlist.index, Random.Default))
        }

        /** Déverrouillage : à la fréquence voulue, une autre image de la liste est choisie (l'affichage suit par les préférences). */
        private fun onUnlock() {
            val now = SystemClock.elapsedRealtime()
            if (UnlockPlaylist.isDuplicate(now, lastUnlockAt)) return
            lastUnlockAt = now
            val playlist = LiveWallpaperStore.read(context).playlist
            if (!playlist.active || !playlist.unlock) return
            val step = UnlockPlaylist.step(playlist.counter, playlist.every, playlist.paths.size, playlist.index, Random.Default)
            if (step.nextIndex != null) LiveWallpaperStore.saveChange(context, step.nextIndex) else LiveWallpaperStore.saveCounter(context, step.counter)
        }
    }

    private companion object {
        /** Distance maximale entre les deux touchers d'un double-tap. */
        const val DOUBLE_TAP_SLOP_DP = 64f

        /** Dernier déverrouillage compté, commun aux moteurs du processus (aperçu du sélecteur, plusieurs écrans). */
        @Volatile
        var lastUnlockAt = -UnlockPlaylist.DEBOUNCE_MS
    }
}
