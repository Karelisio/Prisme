package io.karelisio.prisme.live

import android.content.Context
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
import android.service.wallpaper.WallpaperService
import android.view.Choreographer
import android.view.SurfaceHolder
import kotlin.math.abs

/**
 * Fond animé : l'image glisse légèrement selon l'inclinaison du téléphone.
 * Le capteur n'est actif que lorsque le fond est visible et hors mode économie d'énergie.
 */
class ParallaxWallpaperService : WallpaperService() {
    override fun onCreateEngine(): Engine = ParallaxEngine()

    private inner class ParallaxEngine : Engine(), SensorEventListener, Choreographer.FrameCallback {
        private val prefs = LiveWallpaperStore.prefs(this@ParallaxWallpaperService)
        private val sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        private val sensor: Sensor? =
            sensorManager.getDefaultSensor(Sensor.TYPE_GRAVITY) ?: sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        private val paint = Paint(Paint.FILTER_BITMAP_FLAG)
        private var bitmap: Bitmap? = null
        private var loadedPath: String? = null
        private var width = 0
        private var height = 0
        private var margin = ParallaxMath.margin(LiveWallpaperStore.DEFAULT_INTENSITY)
        private var visible = false
        private var frameScheduled = false

        // Gravité filtrée (accéléromètre brut), position de repos et décalages.
        private val gravity = FloatArray(3)
        private var hasGravity = false
        private var baseX = 0f
        private var baseY = 0f
        private var targetX = 0f
        private var targetY = 0f
        private var currentX = 0f
        private var currentY = 0f

        private val prefsListener = SharedPreferences.OnSharedPreferenceChangeListener { _, _ ->
            loadBitmap()
            draw()
        }

        override fun onCreate(surfaceHolder: SurfaceHolder) {
            super.onCreate(surfaceHolder)
            prefs.registerOnSharedPreferenceChangeListener(prefsListener)
        }

        override fun onDestroy() {
            prefs.unregisterOnSharedPreferenceChangeListener(prefsListener)
            stopSensor()
            bitmap?.recycle()
            bitmap = null
            super.onDestroy()
        }

        override fun onSurfaceChanged(holder: SurfaceHolder, format: Int, w: Int, h: Int) {
            super.onSurfaceChanged(holder, format, w, h)
            width = w
            height = h
            loadedPath = null
            loadBitmap()
            draw()
        }

        override fun onSurfaceDestroyed(holder: SurfaceHolder) {
            visible = false
            stopSensor()
            super.onSurfaceDestroyed(holder)
        }

        override fun onVisibilityChanged(isVisible: Boolean) {
            visible = isVisible
            if (isVisible) {
                hasGravity = false
                startSensor()
                draw()
            } else {
                stopSensor()
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

        private fun loadBitmap() {
            val config = LiveWallpaperStore.read(this@ParallaxWallpaperService)
            margin = ParallaxMath.margin(config.intensity)
            if (width == 0 || height == 0 || config.path == null || config.path == loadedPath) return
            val (targetW, targetH) = ParallaxMath.bitmapSize(width, height, margin)
            val decoded = BitmapFactory.decodeFile(config.path) ?: return
            val scaled = if (decoded.width == targetW && decoded.height == targetH) decoded
            else coverScale(decoded, targetW, targetH).also { if (it !== decoded) decoded.recycle() }
            bitmap?.recycle()
            bitmap = scaled
            loadedPath = config.path
        }

        /** Mise à l'échelle « cover » si l'écran a changé depuis la préparation de l'image. */
        private fun coverScale(source: Bitmap, w: Int, h: Int): Bitmap {
            val scale = maxOf(w.toFloat() / source.width, h.toFloat() / source.height)
            val scaled = Bitmap.createScaledBitmap(source, (source.width * scale).toInt().coerceAtLeast(w), (source.height * scale).toInt().coerceAtLeast(h), true)
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
            val previousX = currentX
            val previousY = currentY
            currentX = ParallaxMath.smooth(currentX, targetX)
            currentY = ParallaxMath.smooth(currentY, targetY)
            val marginX = width * margin
            val marginY = height * margin
            val moved = abs(currentX - previousX) * marginX > 0.25f || abs(currentY - previousY) * marginY > 0.25f
            if (moved) {
                draw()
                scheduleFrame()
            }
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
                    canvas.drawBitmap(image, left, top, paint)
                }
            } catch (e: IllegalStateException) {
                // Surface en cours de destruction : l'image suivante sera dessinée plus tard.
            } finally {
                if (canvas != null) runCatching { holder.unlockCanvasAndPost(canvas) }
            }
        }
    }
}
