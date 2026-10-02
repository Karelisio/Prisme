package io.karelisio.prisme.live

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import android.os.Handler
import android.os.Looper
import androidx.core.content.edit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.tan
import kotlin.random.Random

/**
 * Météo animée par-dessus la photo : pluie, bruine, neige, brouillard ou orage, selon la météo réelle du
 * lieu choisi (Open-Meteo), ou l'aperçu choisi dans l'app. La météo est relevée hors du fil principal, au
 * plus toutes les 30 minutes et seulement quand le fond est visible ; le dernier relevé est gardé (repris
 * au redémarrage, et hors ligne). Désactivée, ou par ciel clair ou nuageux, la couche ne dessine rien.
 */
internal class WeatherOverlay(private val context: Context) : SceneOverlay {
    private val density = context.resources.displayMetrics.density
    private val random = Random.Default
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val handler = Handler(Looper.getMainLooper())
    private val check = Runnable {
        maybeFetch()
        scheduleCheck()
    }
    private var invalidate: () -> Unit = {}
    private var settings: WeatherSettings = readSettings()
    private var reading = LiveWeather.read(context)
    private var look = WeatherLook.NONE
    private var width = 0
    private var height = 0
    private var running = false
    private var fetching = false
    private val clock = MotionClock()

    // Gouttes ou flocons : position, profondeur (0 loin, 1 près), phase du balancement.
    private val px = FloatArray(MAX_DROPS)
    private val py = FloatArray(MAX_DROPS)
    private val depth = FloatArray(MAX_DROPS)
    private val phase = FloatArray(MAX_DROPS)
    private var count = 0

    // Pluie : un trait par goutte, dessinés par plan (loin, milieu, près) en un seul appel chacun.
    private val lines = Array(LAYERS) { FloatArray(MAX_DROPS * 4) }
    private val lineCounts = IntArray(LAYERS)
    private val rainPaints = Array(LAYERS) {
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeCap = Paint.Cap.ROUND
        }
    }
    private var slantSin = 0f
    private var slantCos = 1f
    private var slantSpan = 0f

    private var flake: Bitmap? = null
    private var fog: Bitmap? = null
    private val spritePaint = Paint(Paint.FILTER_BITMAP_FLAG)
    private val rect = RectF()
    private val fogOffsets = FloatArray(FOG_VEILS)
    private var dimColor = 0
    private val flashPaint = Paint()

    // Orage : temps de l'animation (ms), prochain éclair, début de l'éclair en cours (-1 : aucun).
    private var stormMs = 0L
    private var nextLightningMs = 0L
    private var lightningStartMs = -1L

    init {
        refreshLook(notify = false)
    }

    private fun readSettings() = WeatherRules.settings(LiveWallpaperStore.sceneSettings(context, LiveMode.IMAGE))

    override fun attach(invalidate: () -> Unit) {
        this.invalidate = invalidate
    }

    override fun onSize(width: Int, height: Int) {
        if (width == this.width && height == this.height) return
        this.width = width
        this.height = height
        flashPaint.shader = if (height > 0) {
            LinearGradient(0f, 0f, 0f, height.toFloat(), Color.argb(255, 232, 238, 255), Color.argb(64, 232, 238, 255), Shader.TileMode.CLAMP)
        } else {
            null
        }
        applyLook(respawn = true)
    }

    override fun onRunning(running: Boolean) {
        this.running = running
        clock.pause()
        if (running) {
            // Un autre moteur (aperçu, autre écran) a peut-être relevé la météo entre-temps.
            reading = LiveWeather.read(context)
            refreshLook()
            maybeFetch()
            scheduleCheck()
        } else {
            handler.removeCallbacks(check)
        }
    }

    override fun onSettingsChanged() {
        val previous = settings
        settings = readSettings()
        if (settings == previous) return
        // Nouveau lieu : relevé tout de suite, sans attendre la fin du délai après un échec.
        if (settings.latitude != previous.latitude || settings.longitude != previous.longitude) LiveWeather.saveAttempt(context, 0L)
        refreshLook()
        maybeFetch()
        scheduleCheck()
    }

    override fun isAnimating(): Boolean = running && look.effect != WeatherEffect.NONE && width > 0

    override fun draw(canvas: Canvas, frameTimeNanos: Long) {
        if (look.effect == WeatherEffect.NONE || width == 0 || height == 0) return
        val dt = if (running) clock.tick(frameTimeNanos) else 0f
        if (dimColor != 0) canvas.drawColor(dimColor)
        when (look.effect) {
            WeatherEffect.RAIN, WeatherEffect.DRIZZLE -> drawRain(canvas, dt)
            WeatherEffect.STORM -> {
                drawRain(canvas, dt)
                drawLightning(canvas, dt)
            }
            WeatherEffect.SNOW -> drawSnow(canvas, dt)
            WeatherEffect.FOG -> drawFog(canvas, dt)
            WeatherEffect.NONE -> Unit
        }
    }

    override fun release() {
        scope.cancel()
        handler.removeCallbacks(check)
        flake?.recycle()
        fog?.recycle()
        flake = null
        fog = null
    }

    /** Effet à dessiner d'après les réglages et le dernier relevé ; [notify] redemande une image s'il change. */
    private fun refreshLook(notify: Boolean = true) {
        val next = if (settings.enabled) WeatherRules.look(WeatherRules.usable(reading, settings), settings.preview) else WeatherLook.NONE
        if (next == look) return
        val respawn = next.effect != look.effect || next.intensity != look.intensity
        look = next
        applyLook(respawn)
        if (notify) invalidate()
    }

    private fun applyLook(respawn: Boolean) {
        val effect = look.effect
        dimColor = if (look.dim > 0f) Color.argb((look.dim * 255f).roundToInt(), 8, 12, 20) else 0
        slantSin = sin(look.slant)
        slantCos = cos(look.slant)
        slantSpan = height * tan(look.slant)
        val night = if (look.night) NIGHT_ALPHA else 1f
        val drizzle = effect == WeatherEffect.DRIZZLE
        for (layer in 0 until LAYERS) {
            val alpha = (if (drizzle) DRIZZLE_ALPHAS[layer] else RAIN_ALPHAS[layer]) * night
            rainPaints[layer].color = Color.argb((alpha * 255f).roundToInt(), 225, 235, 255)
            rainPaints[layer].strokeWidth = (if (drizzle) DRIZZLE_WIDTHS_DP[layer] else RAIN_WIDTHS_DP[layer]) * density
        }
        if (effect == WeatherEffect.SNOW && flake == null) flake = softDisc()
        if (effect == WeatherEffect.FOG && fog == null) fog = fogTexture(Random(FOG_SEED))
        if (effect == WeatherEffect.STORM) {
            lightningStartMs = -1L
            // Premier éclair assez tôt pour que l'aperçu le montre.
            nextLightningMs = stormMs + FIRST_LIGHTNING_MS
        }
        if (respawn) spawn()
    }

    /** Répartit gouttes ou flocons sur tout l'écran (densité selon l'intensité et la taille de l'écran). */
    private fun spawn() {
        if (width == 0 || height == 0) {
            count = 0
            return
        }
        val (fewest, most) = when (look.effect) {
            WeatherEffect.DRIZZLE -> 140f to 300f
            WeatherEffect.RAIN, WeatherEffect.STORM -> 90f to 300f
            WeatherEffect.SNOW -> 60f to 230f
            WeatherEffect.FOG, WeatherEffect.NONE -> 0f to 0f
        }
        val area = (width / density * (height / density) / REFERENCE_AREA_DP).coerceIn(0.5f, 1.5f)
        count = ((fewest + (most - fewest) * look.intensity) * area).roundToInt().coerceIn(0, MAX_DROPS)
        for (i in 0 until count) {
            // Plans de pluie : la profondeur suit le plan, dessiné avec sa propre épaisseur.
            depth[i] = (i % LAYERS + random.nextFloat()) / LAYERS
            px[i] = random.nextFloat() * (width + slantSpan) - slantSpan
            py[i] = random.nextFloat() * height
            phase[i] = random.nextFloat() * TWO_PI
        }
    }

    private fun drawRain(canvas: Canvas, dt: Float) {
        val drizzle = look.effect == WeatherEffect.DRIZZLE
        lineCounts.fill(0)
        for (i in 0 until count) {
            val d = depth[i]
            val speed = (if (drizzle) lerp(260f, 430f, d) else lerp(480f, 950f, d)) * density
            val length = (if (drizzle) lerp(6f, 12f, d) else lerp(11f, 30f, d)) * density
            px[i] += speed * slantSin * dt
            py[i] += speed * slantCos * dt
            if (py[i] - length > height) {
                py[i] -= height + length
                px[i] = random.nextFloat() * (width + slantSpan) - slantSpan
            }
            val layer = i % LAYERS
            val points = lines[layer]
            val n = lineCounts[layer] * 4
            points[n] = px[i] - slantSin * length
            points[n + 1] = py[i] - slantCos * length
            points[n + 2] = px[i]
            points[n + 3] = py[i]
            lineCounts[layer]++
        }
        for (layer in 0 until LAYERS) {
            if (lineCounts[layer] > 0) canvas.drawLines(lines[layer], 0, lineCounts[layer] * 4, rainPaints[layer])
        }
    }

    private fun drawSnow(canvas: Canvas, dt: Float) {
        val sprite = flake ?: return
        val night = if (look.night) NIGHT_ALPHA else 1f
        val wind = look.drift * WIND_DRIFT_DP * density
        for (i in 0 until count) {
            val d = depth[i]
            val size = lerp(2.5f, 8f, d * d) * density
            phase[i] = (phase[i] + lerp(0.6f, 1.2f, d) * dt).mod(TWO_PI)
            py[i] += lerp(18f, 55f, d) * density * dt
            px[i] += wind * (0.5f + d) * dt
            if (py[i] - size > height) {
                py[i] -= height + 2 * size
                px[i] = random.nextFloat() * width
            }
            if (px[i] > width + size) px[i] -= width + 2 * size else if (px[i] < -size) px[i] += width + 2 * size
            // Balancement : un décalage, pas une vitesse, pour rester doux.
            val x = px[i] + sin(phase[i]) * SWAY_DP * density
            val half = size / 2f
            rect.set(x - half, py[i] - half, x + half, py[i] + half)
            spritePaint.alpha = (lerp(0.5f, 0.95f, d) * night * 255f).roundToInt()
            canvas.drawBitmap(sprite, null, rect, spritePaint)
        }
    }

    private fun drawFog(canvas: Canvas, dt: Float) {
        val texture = fog ?: return
        canvas.drawColor(HAZE_COLOR)
        val veilWidth = width * 2f
        val strength = (look.intensity / 0.75f).coerceIn(0.6f, 1.15f)
        for (k in 0 until FOG_VEILS) {
            fogOffsets[k] = (fogOffsets[k] + FOG_SPEEDS_DP[k] * density * dt).mod(veilWidth)
            val top = FOG_TOPS[k] * height
            val bottom = top + FOG_HEIGHTS[k] * height
            spritePaint.alpha = (min(1f, FOG_ALPHAS[k] * strength) * 255f).roundToInt()
            val offset = fogOffsets[k]
            rect.set(offset - veilWidth, top, offset, bottom)
            canvas.drawBitmap(texture, null, rect, spritePaint)
            rect.set(offset, top, offset + veilWidth, bottom)
            canvas.drawBitmap(texture, null, rect, spritePaint)
        }
    }

    private fun drawLightning(canvas: Canvas, dt: Float) {
        stormMs += (dt * 1000f).toLong()
        if (lightningStartMs < 0L && stormMs >= nextLightningMs) lightningStartMs = stormMs
        if (lightningStartMs < 0L) return
        val elapsed = stormMs - lightningStartMs
        val flash = Lightning.flash(elapsed)
        if (flash > 0f) {
            flashPaint.alpha = (flash * 255f).roundToInt()
            canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), flashPaint)
        }
        if (elapsed >= Lightning.DURATION_MS) {
            lightningStartMs = -1L
            nextLightningMs = stormMs + Lightning.nextDelayMs(random)
        }
    }

    /** Relève la météo si elle est trop ancienne, hors du fil principal ; puis redessine. */
    private fun maybeFetch() {
        if (!running || fetching || !settings.enabled || settings.preview != null) return
        val latitude = settings.latitude ?: return
        val longitude = settings.longitude ?: return
        val now = System.currentTimeMillis()
        if (!WeatherRules.shouldFetch(now, reading, LiveWeather.attemptAt(context), latitude, longitude)) return
        fetching = true
        LiveWeather.saveAttempt(context, now)
        scope.launch {
            val result = withContext(Dispatchers.IO) { runCatching { LiveWeather.fetch(latitude, longitude) }.getOrNull() }
            fetching = false
            if (result != null) {
                LiveWeather.save(context, result)
                reading = result
                refreshLook()
            }
        }
    }

    /** Prochaine vérification, tant que le fond reste visible. */
    private fun scheduleCheck() {
        handler.removeCallbacks(check)
        if (!running || !settings.enabled || settings.preview != null || settings.latitude == null) return
        handler.postDelayed(check, WeatherRules.nextCheckDelay(System.currentTimeMillis(), reading, LiveWeather.attemptAt(context)))
    }

    private companion object {
        const val MAX_DROPS = 400
        const val LAYERS = 3
        const val TWO_PI = ParticleField.TWO_PI

        /** Écran de référence (dp²) pour lequel les nombres de gouttes sont prévus. */
        const val REFERENCE_AREA_DP = 392f * 873f

        val RAIN_ALPHAS = floatArrayOf(0.12f, 0.2f, 0.3f)
        val RAIN_WIDTHS_DP = floatArrayOf(0.45f, 0.6f, 0.8f)
        val DRIZZLE_ALPHAS = floatArrayOf(0.14f, 0.2f, 0.28f)
        val DRIZZLE_WIDTHS_DP = floatArrayOf(0.35f, 0.45f, 0.55f)
        const val NIGHT_ALPHA = 0.85f

        /** Neige : balancement et dérive par vent fort (dp, dp/s). */
        const val SWAY_DP = 14f
        const val WIND_DRIFT_DP = 40f

        /** Brouillard : voiles (haut et hauteur en fractions de l'écran, vitesse en dp/s, opacité) et voile uniforme. */
        const val FOG_VEILS = 3
        val FOG_TOPS = floatArrayOf(-0.05f, 0.30f, 0.58f)
        val FOG_HEIGHTS = floatArrayOf(0.45f, 0.48f, 0.51f)
        val FOG_SPEEDS_DP = floatArrayOf(9f, -6f, 13f)
        val FOG_ALPHAS = floatArrayOf(0.6f, 0.7f, 0.8f)
        val HAZE_COLOR = Color.argb(20, 225, 230, 235)
        const val FOG_SEED = 11

        const val FIRST_LIGHTNING_MS = 2_500L

        fun lerp(a: Float, b: Float, t: Float) = a + (b - a) * t

        /** Flocon : disque blanc aux bords fondus. */
        fun softDisc(): Bitmap {
            val size = 32
            val c = (size - 1) / 2f
            val pixels = IntArray(size * size) {
                val s = sqrt(((it % size - c) * (it % size - c) + (it / size - c) * (it / size - c))) / (size / 2f)
                val alpha = when {
                    s < 0.45f -> lerp(1f, 0.8f, s / 0.45f)
                    s < 1f -> lerp(0.8f, 0f, (s - 0.45f) / 0.55f)
                    else -> 0f
                }
                ((alpha * 255f).roundToInt() shl 24) or 0xFFFFFF
            }
            return Bitmap.createBitmap(pixels, size, size, Bitmap.Config.ARGB_8888)
        }

        /** Voile de brouillard : nappes étirées en largeur, raccordées à gauche et à droite pour défiler sans couture. */
        fun fogTexture(random: Random): Bitmap {
            val w = 256
            val h = 128
            val acc = FloatArray(w * h)
            repeat(40) {
                val cx = random.nextFloat() * w
                val cy = h * (0.35f + random.nextFloat() * 0.3f)
                val ry = 14f + random.nextFloat() * 20f
                val rx = ry * 2.6f
                for (y in max(0, (cy - ry).toInt())..min(h - 1, (cy + ry).toInt())) {
                    val dy = (y - cy) / ry
                    for (xi in (cx - rx).toInt()..(cx + rx).toInt()) {
                        val dx = (xi - cx) / rx
                        val s = sqrt(dx * dx + dy * dy)
                        if (s < 1f) acc[y * w + xi.mod(w)] += 0.16f * (1f - s)
                    }
                }
            }
            val pixels = IntArray(w * h) { ((min(1f, acc[it]) * 255f).roundToInt() shl 24) or 0xFFFFFF }
            return Bitmap.createBitmap(pixels, w, h, Bitmap.Config.ARGB_8888)
        }
    }
}

/**
 * Dernier relevé de la météo animée, gardé à part des réglages de l'app (qui remplacent leur JSON en
 * entier) : repris au redémarrage et affiché hors ligne. L'app le lit par `getStatus`.
 */
internal object LiveWeather {
    private const val PREFS = "prisme_live_weather"
    private const val KEY_CODE = "code"
    private const val KEY_PRECIPITATION = "precipitation"
    private const val KEY_WIND = "wind"
    private const val KEY_DAY = "is_day"
    private const val KEY_LATITUDE = "latitude"
    private const val KEY_LONGITUDE = "longitude"
    private const val KEY_FETCHED_AT = "fetched_at"
    private const val KEY_ATTEMPT_AT = "attempt_at"

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun read(context: Context): WeatherReading? {
        val prefs = prefs(context)
        val fetchedAt = prefs.getLong(KEY_FETCHED_AT, 0L)
        if (fetchedAt <= 0L) return null
        return WeatherReading(
            code = prefs.getInt(KEY_CODE, 0),
            precipitation = prefs.getFloat(KEY_PRECIPITATION, 0f),
            windKmh = prefs.getFloat(KEY_WIND, 0f),
            isDay = prefs.getBoolean(KEY_DAY, true),
            latitude = Double.fromBits(prefs.getLong(KEY_LATITUDE, 0L)),
            longitude = Double.fromBits(prefs.getLong(KEY_LONGITUDE, 0L)),
            fetchedAt = fetchedAt,
        )
    }

    fun save(context: Context, reading: WeatherReading) {
        prefs(context).edit {
            putInt(KEY_CODE, reading.code)
            putFloat(KEY_PRECIPITATION, reading.precipitation)
            putFloat(KEY_WIND, reading.windKmh)
            putBoolean(KEY_DAY, reading.isDay)
            putLong(KEY_LATITUDE, reading.latitude.toRawBits())
            putLong(KEY_LONGITUDE, reading.longitude.toRawBits())
            putLong(KEY_FETCHED_AT, reading.fetchedAt)
        }
    }

    /** Dernier essai de relevé (réussi ou non), 0 : aucun. */
    fun attemptAt(context: Context): Long = prefs(context).getLong(KEY_ATTEMPT_AT, 0L)

    fun saveAttempt(context: Context, at: Long) {
        prefs(context).edit { putLong(KEY_ATTEMPT_AT, at) }
    }

    /** Relève la météo actuelle du lieu (réseau : à appeler hors du fil principal). */
    fun fetch(latitude: Double, longitude: Double): WeatherReading {
        val connection = URL(WeatherRules.url(latitude, longitude)).openConnection() as HttpURLConnection
        connection.connectTimeout = 10_000
        connection.readTimeout = 10_000
        try {
            if (connection.responseCode != 200) throw IOException("HTTP ${connection.responseCode}")
            val body = connection.inputStream.bufferedReader().use { it.readText() }
            return WeatherRules.parse(body, latitude, longitude, System.currentTimeMillis())
        } finally {
            connection.disconnect()
        }
    }
}
