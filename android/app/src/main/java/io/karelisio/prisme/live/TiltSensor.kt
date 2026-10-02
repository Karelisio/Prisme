package io.karelisio.prisme.live

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager

/**
 * Inclinaison du téléphone pour les scènes qui bougent avec lui (parallaxe, relief, particules). Le capteur
 * ne tourne qu'entre [start] et [stop] ; [onChange] est appelé à chaque mesure, sur le fil principal.
 */
internal class TiltSensor(context: Context, private val onChange: () -> Unit) : SensorEventListener {
    private val manager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val sensor: Sensor? =
        manager.getDefaultSensor(Sensor.TYPE_GRAVITY) ?: manager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)

    // Gravité filtrée (accéléromètre brut) et position de repos, qui suit lentement la façon de tenir le téléphone.
    private val gravity = FloatArray(3)
    private var hasGravity = false
    private var baseX = 0f
    private var baseY = 0f
    private var listening = false

    /** Décalage voulu, de -1 à 1, par rapport à la position de repos (gauche-droite, avant-arrière). */
    var targetX = 0f
        private set
    var targetY = 0f
        private set

    /** Gravité dans le repère de l'écran (x vers la droite, y vers le bas), en g ; (0, 1) téléphone droit. */
    var screenGravityX = 0f
        private set
    var screenGravityY = 1f
        private set

    fun start() {
        if (sensor == null || listening) return
        hasGravity = false
        listening = manager.registerListener(this, sensor, SensorManager.SENSOR_DELAY_GAME)
    }

    fun stop() {
        if (!listening) return
        manager.unregisterListener(this)
        listening = false
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
        screenGravityX = (-gravity[0] / SensorManager.GRAVITY_EARTH).coerceIn(-1f, 1f)
        screenGravityY = (gravity[1] / SensorManager.GRAVITY_EARTH).coerceIn(-1f, 1f)
        onChange()
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
}
