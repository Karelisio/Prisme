package io.karelisio.prisme.live

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.SharedPreferences
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.PowerManager
import android.os.SystemClock
import android.service.wallpaper.WallpaperService
import android.view.Choreographer
import android.view.SurfaceHolder
import androidx.core.content.ContextCompat
import androidx.core.graphics.scale
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.math.abs
import kotlin.random.Random

/**
 * Fond animé : l'image glisse légèrement selon l'inclinaison du téléphone.
 * Le capteur n'est actif que lorsque le fond est visible et hors mode économie d'énergie.
 * Avec une liste active (« changer à chaque déverrouillage »), l'image change tous les N déverrouillages,
 * en fondu enchaîné.
 */
class ParallaxWallpaperService : WallpaperService() {
    override fun onCreateEngine(): Engine = ParallaxEngine()

    private inner class ParallaxEngine : Engine(), SensorEventListener, Choreographer.FrameCallback {
        private val prefs = LiveWallpaperStore.prefs(this@ParallaxWallpaperService)
        private val sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        private val sensor: Sensor? =
            sensorManager.getDefaultSensor(Sensor.TYPE_GRAVITY) ?: sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        private val paint = Paint(Paint.FILTER_BITMAP_FLAG)
        private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
        private var bitmap: Bitmap? = null
        private var loadedPath: String? = null
        private var width = 0
        private var height = 0
        private var margin = ParallaxMath.margin(LiveWallpaperStore.DEFAULT_INTENSITY)
        private var visible = false
        private var frameScheduled = false

        // Changement d'image : chargement en cours (le numéro écarte les résultats devenus inutiles),
        // puis fondu depuis l'ancienne image (début à 0 tant que la première image du fondu n'est pas passée).
        private var pendingPath: String? = null
        private var loadTicket = 0
        private var fadeFrom: Bitmap? = null
        private var fadeStartNanos = 0L
        private var fadeAlpha = FULL_ALPHA

        // Gravité filtrée (accéléromètre brut), position de repos et décalages.
        private val gravity = FloatArray(3)
        private var hasGravity = false
        private var baseX = 0f
        private var baseY = 0f
        private var targetX = 0f
        private var targetY = 0f
        private var currentX = 0f
        private var currentY = 0f

        private val prefsListener = SharedPreferences.OnSharedPreferenceChangeListener { _, key ->
            if (key != LiveWallpaperStore.KEY_COUNTER) refresh()
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
                ContextCompat.registerReceiver(
                    this@ParallaxWallpaperService,
                    unlockReceiver,
                    IntentFilter(Intent.ACTION_USER_PRESENT),
                    ContextCompat.RECEIVER_EXPORTED,
                )
            }.isSuccess
        }

        override fun onDestroy() {
            prefs.unregisterOnSharedPreferenceChangeListener(prefsListener)
            if (unlockRegistered) unregisterReceiver(unlockReceiver)
            unlockRegistered = false
            scope.cancel()
            stopSensor()
            finishFade()
            bitmap?.recycle()
            bitmap = null
            super.onDestroy()
        }

        override fun onSurfaceChanged(holder: SurfaceHolder, format: Int, w: Int, h: Int) {
            super.onSurfaceChanged(holder, format, w, h)
            width = w
            height = h
            loadedPath = null
            refresh(immediate = true)
            draw()
        }

        override fun onSurfaceDestroyed(holder: SurfaceHolder) {
            visible = false
            stopSensor()
            finishFade()
            super.onSurfaceDestroyed(holder)
        }

        override fun onVisibilityChanged(isVisible: Boolean) {
            visible = isVisible
            if (isVisible) {
                hasGravity = false
                startSensor()
                refresh()
                draw()
            } else {
                stopSensor()
                // Fondu interrompu : la nouvelle image reste seule affichée.
                finishFade()
            }
        }

        private fun startSensor() {
            val power = getSystemService(Context.POWER_SERVICE) as PowerManager
            if (sensor == null || power.isPowerSaveMode) return
            sensorManager.registerListener(this, sensor, SensorManager.SENSOR_DELAY_GAME)
        }

        private fun stopSensor() {
            sensorManager.unregisterListener(this)
            if (frameScheduled) Choreographer.getInstance().removeFrameCallback(this)
            frameScheduled = false
        }

        /** Déverrouillage : à la fréquence voulue, une autre image de la liste est choisie (l'affichage suit par les préférences). */
        private fun onUnlock() {
            val now = SystemClock.elapsedRealtime()
            if (UnlockPlaylist.isDuplicate(now, lastUnlockAt)) return
            lastUnlockAt = now
            val context = this@ParallaxWallpaperService
            val playlist = LiveWallpaperStore.read(context).playlist
            if (!playlist.active) return
            val step = UnlockPlaylist.step(playlist.counter, playlist.every, playlist.paths.size, playlist.index, Random.Default)
            if (step.nextIndex != null) LiveWallpaperStore.saveChange(context, step.nextIndex) else LiveWallpaperStore.saveCounter(context, step.counter)
        }

        /**
         * Affiche l'image voulue par la configuration. Sans liste active, comme avant : chargée et affichée
         * tout de suite. Avec une liste active, les changements d'image se font hors du fil d'affichage, puis
         * apparaissent en fondu quand le fond est visible ; la première image et le changement de taille
         * ([immediate]) restent immédiats.
         */
        private fun refresh(immediate: Boolean = false) {
            val config = LiveWallpaperStore.read(this@ParallaxWallpaperService)
            val newMargin = ParallaxMath.margin(config.intensity)
            val marginChanged = newMargin != margin
            margin = newMargin
            val path = config.shownPath
            if (width == 0 || height == 0 || path == null || path == loadedPath) {
                // Rien de nouveau à afficher : un chargement encore en cours serait périmé.
                cancelPending()
                if (marginChanged) draw()
                return
            }
            if (path == pendingPath) return
            cancelPending()
            val (targetW, targetH) = ParallaxMath.bitmapSize(width, height, margin)
            if (immediate || bitmap == null || !config.playlist.active) {
                val (loaded, image) = load(path, config.path, targetW, targetH) ?: return
                install(loaded, image, fade = false)
                return
            }
            val ticket = ++loadTicket
            pendingPath = path
            scope.launch {
                val result = withContext(Dispatchers.IO) { load(path, config.path, targetW, targetH) }
                if (ticket != loadTicket) {
                    result?.second?.recycle()
                    return@launch
                }
                pendingPath = null
                if (result != null) install(result.first, result.second, fade = visible)
            }
        }

        private fun cancelPending() {
            loadTicket++
            pendingPath = null
        }

        /**
         * Charge l'image préparée, ou à défaut [fallback] (l'image choisie dans l'app, si le fichier de la
         * liste a disparu). Renvoie le chemin réellement chargé et son bitmap.
         */
        private fun load(path: String, fallback: String?, w: Int, h: Int): Pair<String, Bitmap>? {
            decode(path, w, h)?.let { return path to it }
            if (fallback != null && fallback != path) decode(fallback, w, h)?.let { return fallback to it }
            return null
        }

        /** Décode l'image à la taille voulue. N'utilise pas l'état du moteur : appelable hors du fil d'affichage. */
        private fun decode(path: String, targetW: Int, targetH: Int): Bitmap? = try {
            val decoded = BitmapFactory.decodeFile(path)
            when {
                decoded == null -> null
                decoded.width == targetW && decoded.height == targetH -> decoded
                else -> coverScale(decoded, targetW, targetH).also { if (it !== decoded) decoded.recycle() }
            }
        } catch (e: OutOfMemoryError) {
            null
        }

        /** Affiche [image] ; en fondu depuis l'image actuelle si [fade], sinon à sa place. */
        private fun install(path: String, image: Bitmap, fade: Boolean) {
            if (path == loadedPath && bitmap != null) {
                // Déjà affichée (image de repli quand celle de la liste manque) : rien à changer.
                image.recycle()
                return
            }
            finishFade()
            val previous = bitmap
            bitmap = image
            loadedPath = path
            if (fade && previous != null) {
                fadeFrom = previous
                fadeAlpha = 0
                fadeStartNanos = 0L
                scheduleFrame()
            } else {
                previous?.recycle()
            }
            draw()
        }

        /** Termine le fondu d'un coup : l'ancienne image est libérée. */
        private fun finishFade() {
            fadeFrom?.recycle()
            fadeFrom = null
            fadeAlpha = FULL_ALPHA
        }

        /** Mise à l'échelle « cover » si l'écran a changé depuis la préparation de l'image. */
        private fun coverScale(source: Bitmap, w: Int, h: Int): Bitmap {
            val scale = maxOf(w.toFloat() / source.width, h.toFloat() / source.height)
            val scaled = source.scale((source.width * scale).toInt().coerceAtLeast(w), (source.height * scale).toInt().coerceAtLeast(h))
            val left = (scaled.width - w) / 2
            val top = (scaled.height - h) / 2
            val cropped = Bitmap.createBitmap(scaled, left, top, w, h)
            if (cropped !== scaled) scaled.recycle()
            return cropped
        }

        override fun onSensorChanged(event: SensorEvent) {
            if (event.sensor.type == Sensor.TYPE_ACCELEROMETER) {
                // Filtre passe-bas : ne garder que la gravité.
                for (i in 0..2) gravity[i] = if (hasGravity) gravity[i] + (event.values[i] - gravity[i]) * 0.15f else event.values[i]
            } else {
                for (i in 0..2) gravity[i] = event.values[i]
            }
            val (tiltX, tiltY) = ParallaxMath.tilt(gravity[0], gravity[1], gravity[2])
            if (!hasGravity) {
                baseX = tiltX
                baseY = tiltY
                hasGravity = true
            }
            baseX = ParallaxMath.recenter(baseX, tiltX)
            baseY = ParallaxMath.recenter(baseY, tiltY)
            targetX = ParallaxMath.normalized(tiltX, baseX)
            targetY = ParallaxMath.normalized(tiltY, baseY)
            scheduleFrame()
        }

        override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

        private fun scheduleFrame() {
            if (frameScheduled || !visible) return
            frameScheduled = true
            Choreographer.getInstance().postFrameCallback(this)
        }

        override fun doFrame(frameTimeNanos: Long) {
            frameScheduled = false
            val fading = advanceFade(frameTimeNanos)
            val previousX = currentX
            val previousY = currentY
            currentX = ParallaxMath.smooth(currentX, targetX)
            currentY = ParallaxMath.smooth(currentY, targetY)
            val marginX = width * margin
            val marginY = height * margin
            val moved = abs(currentX - previousX) * marginX > 0.25f || abs(currentY - previousY) * marginY > 0.25f
            if (moved || fading) {
                draw()
                if (fading && fadeAlpha >= FULL_ALPHA) finishFade()
                if (moved || fadeFrom != null) scheduleFrame()
            }
        }

        /** Fait avancer le fondu ; vrai tant qu'il y a quelque chose à redessiner. */
        private fun advanceFade(frameTimeNanos: Long): Boolean {
            if (fadeFrom == null) return false
            if (fadeStartNanos == 0L) fadeStartNanos = frameTimeNanos
            fadeAlpha = UnlockPlaylist.fadeAlpha((frameTimeNanos - fadeStartNanos) / NANOS_PER_MS)
            return true
        }

        private fun draw() {
            val holder = surfaceHolder ?: return
            val image = bitmap
            var canvas: Canvas? = null
            try {
                canvas = if (Build.VERSION.SDK_INT >= 26) holder.lockHardwareCanvas() else holder.lockCanvas()
                if (canvas == null) return
                canvas.drawColor(Color.BLACK)
                if (image != null) {
                    val left = ParallaxMath.drawOffset(currentX, width * margin)
                    val top = ParallaxMath.drawOffset(currentY, height * margin)
                    val previous = fadeFrom
                    if (previous != null) {
                        // Fondu enchaîné : l'ancienne image, puis la nouvelle de plus en plus opaque par-dessus.
                        canvas.drawBitmap(previous, left, top, paint)
                        paint.alpha = fadeAlpha
                        canvas.drawBitmap(image, left, top, paint)
                        paint.alpha = FULL_ALPHA
                    } else {
                        canvas.drawBitmap(image, left, top, paint)
                    }
                }
            } catch (e: IllegalStateException) {
                // Surface en cours de destruction : l'image suivante sera dessinée plus tard.
            } finally {
                if (canvas != null) runCatching { holder.unlockCanvasAndPost(canvas) }
            }
        }
    }

    private companion object {
        const val FULL_ALPHA = 255
        const val NANOS_PER_MS = 1_000_000L

        /** Dernier déverrouillage compté, commun aux moteurs du processus (aperçu du sélecteur, plusieurs écrans). */
        @Volatile
        var lastUnlockAt = -UnlockPlaylist.DEBOUNCE_MS
    }
}
