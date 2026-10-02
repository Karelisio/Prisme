package io.karelisio.prisme.live

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Shader
import android.view.MotionEvent
import androidx.core.graphics.createBitmap
import androidx.core.graphics.withTranslation
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Particules interactives (lucioles, bulles, étoiles, neige) : elles dérivent, suivent l'inclinaison du
 * téléphone et s'écartent du doigt (ou s'en approchent). Pleine cadence pendant un toucher ou une gerbe,
 * cadence réduite au repos. Double-tap : une gerbe d'étincelles au centre.
 */
internal class ParticlesScene(context: Context) : CanvasScene(context) {
    override val wantsTouch: Boolean get() = true

    private val density = context.resources.displayMetrics.density
    private val particles = ParticleField()
    private val touch = ParticleTouch()
    private val tilt = TiltSensor(context) {}
    private val clock = MotionClock(maxStepNanos = 50_000_000L)
    private val sprites = ParticleSprites()
    private val gradient = GradientRenderer()
    private val grain = Grain()
    private var settings: ParticleSettings = readSettings()
    private var lastTouchMs = 0L

    // Fond « photo » : l'image du genre photo, assombrie, chargée hors du fil d'affichage.
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var photo: Bitmap? = null
    private var photoPath: String? = null
    private var photoTicket = 0
    private val photoSource = Rect()
    private val screen = Rect()

    private val spritePaint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG)
    private val photoPaint = Paint(Paint.FILTER_BITMAP_FLAG)
    private val rect = RectF()

    override val maxFps: Int get() = if (touch.active || particles.excited) MAX_FPS else settings.style.idleFps

    private fun readSettings() = ParticleRules.settings(LiveWallpaperStore.sceneSettings(context, LiveMode.PARTICLES))

    override fun onSize(width: Int, height: Int) {
        screen.set(0, 0, width, height)
        sprites.prepare(settings.style)
        resetField()
        gradient.resize(width, height)
        paintGradient()
        loadPhoto()
    }

    private fun resetField() {
        if (width == 0 || height == 0) return
        val count = ParticleRules.count(settings.style, settings.density, width / density, height / density)
        particles.reset(settings.style, count, width.toFloat(), height.toFloat(), density)
    }

    /** Fond « dégradé » : peint une fois (fixe), assez sombre pour que les particules ressortent. */
    private fun paintGradient() {
        val palette = SystemPalette.resolve(context, settings.palette, settings.accent)
        gradient.render(palette, null, 1f, GRADIENT_TIME, BACKGROUND_GAIN)
    }

    override fun onSettingsChanged() {
        val previous = settings
        settings = readSettings()
        if (previous.style != settings.style || previous.density != settings.density) {
            sprites.prepare(settings.style)
            resetField()
        }
        if (previous.palette != settings.palette || previous.accent != settings.accent) paintGradient()
        // Toute préférence peut avoir changé l'image du genre photo : rechargée si son chemin a changé.
        loadPhoto()
        if (running) requestFrame() else drawNow()
    }

    override fun onRunningChanged(running: Boolean) {
        clock.pause()
        if (running) {
            tilt.start()
            if (settings.palette == MotionPalettes.SYSTEM) paintGradient()
        } else {
            tilt.stop()
            touch.active = false
        }
    }

    override fun onTouch(event: MotionEvent) {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                touch.active = true
                touch.x = event.x
                touch.y = event.y
                touch.vx = 0f
                touch.vy = 0f
                lastTouchMs = event.eventTime
            }
            MotionEvent.ACTION_MOVE -> {
                val dtMs = (event.eventTime - lastTouchMs).coerceAtLeast(1L).toFloat()
                // Vitesse du doigt lissée : un événement isolé ne lance pas les particules.
                touch.vx += ((event.x - touch.x) * 1000f / dtMs - touch.vx) * 0.5f
                touch.vy += ((event.y - touch.y) * 1000f / dtMs - touch.vy) * 0.5f
                touch.x = event.x
                touch.y = event.y
                lastTouchMs = event.eventTime
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> touch.active = false
        }
        requestFrame()
    }

    /** Double-tap : gerbe au centre (rien pendant la pause en économie de batterie : la scène reste figée). */
    override fun onDoubleTap(): Boolean {
        if (running && width > 0 && height > 0) {
            particles.burst(width / 2f, height / 2f)
            requestFrame()
        }
        return true
    }

    override fun advance(frameTimeNanos: Long): Boolean {
        val dt = clock.tick(frameTimeNanos)
        // Doigt immobile : son élan s'éteint vite.
        val calm = exp(-TOUCH_CALM * dt)
        touch.vx *= calm
        touch.vy *= calm
        particles.step(dt, tilt.screenGravityX, tilt.screenGravityY, touch, settings.attract)
        return true
    }

    override fun isAnimating(): Boolean = true

    override fun drawScene(canvas: Canvas, frameTimeNanos: Long) {
        drawBackground(canvas)
        val main = sprites.main ?: return
        val style = particles.style
        for (i in 0 until particles.count) {
            var alpha: Float
            var scale = 1f
            var sprite = main
            when (style) {
                ParticleStyle.FIREFLIES -> {
                    val glow = ParticleRules.fireflyGlow(particles.phase[i])
                    alpha = 0.12f + 0.88f * glow
                    scale = 0.8f + 0.4f * glow
                }
                ParticleStyle.BUBBLES -> alpha = 0.55f + 0.4f * particles.depth[i]
                ParticleStyle.STARS -> {
                    alpha = ParticleRules.twinkle(particles.phase[i], particles.phase2[i]) * (0.45f + 0.55f * particles.depth[i])
                    val flare = sprites.flare
                    if (particles.depth[i] > FLARE_DEPTH && flare != null) {
                        sprite = flare
                        scale = FLARE_SCALE
                    }
                }
                ParticleStyle.SNOW -> alpha = 0.45f + 0.5f * particles.depth[i]
            }
            drawSprite(canvas, sprite, particles.x[i], particles.y[i], particles.size[i] * scale, alpha)
        }
        if (particles.sparksAlive > 0) {
            val spark = sprites.flare ?: main
            for (i in ParticleRules.MAX_PARTICLES until particles.capacity) {
                if (particles.life[i] <= 0f) continue
                val twinkle = if (style == ParticleStyle.STARS) ParticleRules.twinkle(particles.phase2[i], particles.phase2[i] * 0.7f + 1f) else 1f
                drawSprite(canvas, spark, particles.x[i], particles.y[i], particles.size[i] * (if (spark === main) 1f else FLARE_SCALE), particles.sparkAlpha(i) * twinkle)
            }
        }
    }

    private fun drawSprite(canvas: Canvas, sprite: Bitmap, x: Float, y: Float, size: Float, alpha: Float) {
        val half = size / 2f
        rect.set(x - half, y - half, x + half, y + half)
        spritePaint.alpha = (alpha * 255f).roundToInt().coerceIn(0, 255)
        canvas.drawBitmap(sprite, null, rect, spritePaint)
    }

    private fun drawBackground(canvas: Canvas) {
        val image = photo
        when {
            settings.background == ParticleBackground.PHOTO && image != null -> canvas.drawBitmap(image, photoSource, screen, photoPaint)
            settings.background == ParticleBackground.COLOR -> canvas.drawColor(settings.color)
            else -> {
                // Dégradé (aussi quand le genre photo n'a pas encore d'image).
                gradient.draw(canvas)
                grain.draw(canvas, width, height)
            }
        }
    }

    /** Charge l'image du genre photo pour le fond « photo » (rien à faire si elle est déjà affichée). */
    private fun loadPhoto() {
        val path = if (settings.background == ParticleBackground.PHOTO) LiveWallpaperStore.read(context).path else null
        if (path == null || width == 0 || height == 0) {
            photoTicket++
            releasePhoto()
            return
        }
        if (path == photoPath && photo != null) return
        val ticket = ++photoTicket
        val w = width
        val h = height
        scope.launch {
            val image = withContext(Dispatchers.IO) { decodeDimmed(path, w, h) }
            if (ticket != photoTicket) {
                image?.recycle()
                return@launch
            }
            releasePhoto()
            photo = image
            photoPath = if (image != null) path else null
            if (image != null) coverSource(image)
            if (!running) drawNow()
        }
    }

    /** Partie de l'image qui couvre l'écran, centrée. */
    private fun coverSource(image: Bitmap) {
        val scale = max(width.toFloat() / image.width, height.toFloat() / image.height)
        val w = (width / scale).roundToInt().coerceIn(1, image.width)
        val h = (height / scale).roundToInt().coerceIn(1, image.height)
        val left = (image.width - w) / 2
        val top = (image.height - h) / 2
        photoSource.set(left, top, left + w, top + h)
    }

    private fun releasePhoto() {
        photo?.recycle()
        photo = null
        photoPath = null
    }

    override fun release() {
        super.release()
        tilt.stop()
        scope.cancel()
        releasePhoto()
        sprites.release()
        gradient.release()
        grain.release()
    }

    private companion object {
        const val MAX_FPS = 60

        /** Fond « dégradé » : instant de l'animation retenu et atténuation des taches. */
        const val GRADIENT_TIME = 12.0
        const val BACKGROUND_GAIN = 0.55f

        /** Assombrissement de la photo (noir à environ 30 %). */
        const val PHOTO_DIM = 0x4D000000

        /** Étoiles proches : sprite avec aigrettes, plus grand. */
        const val FLARE_DEPTH = 0.85f
        const val FLARE_SCALE = 2.6f

        /** Extinction de l'élan du doigt (par seconde). */
        const val TOUCH_CALM = 8f

        /** Décode l'image (réduite si elle est bien plus grande que l'écran) et l'assombrit. Hors du fil d'affichage. */
        fun decodeDimmed(path: String, width: Int, height: Int): Bitmap? = try {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(path, bounds)
            var sample = 1
            while (bounds.outWidth / (sample * 2) >= width && bounds.outHeight / (sample * 2) >= height) sample *= 2
            val options = BitmapFactory.Options().apply {
                inSampleSize = sample
                inMutable = true
            }
            BitmapFactory.decodeFile(path, options)?.also { Canvas(it).drawColor(PHOTO_DIM) }
        } catch (e: OutOfMemoryError) {
            null
        }
    }
}

/** Sprites des particules, dessinés une fois par style : un dessin par particule suffit ensuite. */
private class ParticleSprites {
    var main: Bitmap? = null
        private set

    /** Étoiles : sprite avec aigrettes (étoiles proches, étincelles). */
    var flare: Bitmap? = null
        private set
    private var style: ParticleStyle? = null

    fun prepare(style: ParticleStyle) {
        if (this.style == style && main != null) return
        release()
        this.style = style
        try {
            main = when (style) {
                ParticleStyle.FIREFLIES -> firefly()
                ParticleStyle.BUBBLES -> bubble()
                ParticleStyle.STARS -> star()
                ParticleStyle.SNOW -> snowflake()
            }
            flare = if (style == ParticleStyle.STARS) starFlare() else null
        } catch (e: OutOfMemoryError) {
            release()
        }
    }

    fun release() {
        main?.recycle()
        flare?.recycle()
        main = null
        flare = null
        style = null
    }

    private fun sprite(size: Int, draw: (Canvas, Float, Paint) -> Unit): Bitmap {
        val bitmap = createBitmap(size, size)
        draw(Canvas(bitmap), size / 2f, Paint(Paint.ANTI_ALIAS_FLAG))
        return bitmap
    }

    /** Point lumineux jaune-vert : cœur presque blanc, halo large. */
    private fun firefly() = sprite(96) { canvas, r, paint ->
        paint.shader = RadialGradient(
            r, r, r,
            intArrayOf(
                Color.argb(255, 255, 253, 230), Color.argb(242, 250, 255, 180), Color.argb(158, 225, 255, 120),
                Color.argb(66, 190, 245, 90), Color.argb(20, 160, 230, 80), Color.argb(0, 150, 220, 70),
            ),
            floatArrayOf(0f, 0.08f, 0.18f, 0.36f, 0.62f, 1f),
            Shader.TileMode.CLAMP,
        )
        canvas.drawRect(0f, 0f, 2 * r, 2 * r, paint)
    }

    /** Bulle : voile très léger, liseré irisé et reflet. */
    private fun bubble() = sprite(160) { canvas, r, paint ->
        val radius = r - 2f
        paint.shader = RadialGradient(
            r, r, radius,
            intArrayOf(Color.argb(5, 255, 255, 255), Color.argb(5, 255, 255, 255), Color.argb(15, 200, 235, 255), Color.argb(77, 210, 240, 255), Color.argb(0, 255, 255, 255)),
            floatArrayOf(0f, 0.2f, 0.8f, 0.944f, 1f),
            Shader.TileMode.CLAMP,
        )
        canvas.drawCircle(r, r, radius, paint)
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = 2.75f
        paint.shader = LinearGradient(
            0f, 0f, 2 * r, 2 * r,
            intArrayOf(Color.argb(191, 255, 255, 255), Color.argb(89, 160, 220, 255), Color.argb(140, 255, 170, 230)),
            floatArrayOf(0f, 0.5f, 1f),
            Shader.TileMode.CLAMP,
        )
        canvas.drawCircle(r, r, radius - 1.9f, paint)
        paint.style = Paint.Style.FILL
        val highlight = radius * 0.32f
        canvas.withTranslation(r - radius * 0.38f, r - radius * 0.42f) {
            rotate(-40f)
            scale(1f, 0.55f)
            paint.shader = RadialGradient(0f, 0f, highlight, Color.argb(230, 255, 255, 255), Color.argb(0, 255, 255, 255), Shader.TileMode.CLAMP)
            drawCircle(0f, 0f, highlight, paint)
        }
    }

    /** Étoile lointaine : point doux. */
    private fun star() = sprite(64) { canvas, r, paint ->
        paint.shader = RadialGradient(
            r, r, r * 0.5f,
            intArrayOf(Color.WHITE, Color.argb(204, 235, 242, 255), Color.argb(46, 190, 210, 255), Color.argb(0, 190, 210, 255)),
            floatArrayOf(0f, 0.25f, 0.6f, 1f),
            Shader.TileMode.CLAMP,
        )
        canvas.drawRect(0f, 0f, 2 * r, 2 * r, paint)
    }

    /** Étoile proche : cœur brillant et deux aigrettes en croix. */
    private fun starFlare() = sprite(128) { canvas, r, paint ->
        paint.shader = RadialGradient(
            r, r, r * 0.3f,
            intArrayOf(Color.WHITE, Color.argb(191, 235, 242, 255), Color.argb(0, 190, 210, 255)),
            floatArrayOf(0f, 0.3f, 1f),
            Shader.TileMode.CLAMP,
        )
        canvas.drawRect(0f, 0f, 2 * r, 2 * r, paint)
        val half = 1.2f
        val colors = intArrayOf(Color.argb(0, 220, 230, 255), Color.argb(217, 240, 245, 255), Color.argb(0, 220, 230, 255))
        paint.shader = LinearGradient(0f, r, 2 * r, r, colors, null, Shader.TileMode.CLAMP)
        canvas.drawRect(0f, r - half, 2 * r, r + half, paint)
        paint.shader = LinearGradient(r, 0f, r, 2 * r, colors, null, Shader.TileMode.CLAMP)
        canvas.drawRect(r - half, 0f, r + half, 2 * r, paint)
    }

    /** Flocon : disque blanc aux bords fondus. */
    private fun snowflake() = sprite(64) { canvas, r, paint ->
        paint.shader = RadialGradient(
            r, r, r,
            intArrayOf(Color.argb(242, 255, 255, 255), Color.argb(191, 255, 255, 255), Color.argb(64, 240, 246, 255), Color.argb(0, 240, 246, 255)),
            floatArrayOf(0f, 0.35f, 0.65f, 1f),
            Shader.TileMode.CLAMP,
        )
        canvas.drawRect(0f, 0f, 2 * r, 2 * r, paint)
    }
}
