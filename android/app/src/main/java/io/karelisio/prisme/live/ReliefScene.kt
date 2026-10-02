package io.karelisio.prisme.live

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import androidx.core.graphics.scale
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Relief 3D : le sujet de la photo, détouré à l'avance ([ReliefPreparer]), se détache de l'arrière-plan
 * quand le téléphone bouge ; l'arrière-plan glisse un peu, le sujet davantage ([ReliefLayout]), avec une
 * ombre douce facultative. Sans relief préparé, la photo du fond animé s'affiche seule.
 */
internal class ReliefScene(context: Context) : CanvasScene(context) {
    /** Images affichées et place du sujet dans l'image préparée. */
    private class Layers(
        val background: Bitmap,
        val subject: Bitmap?,
        val shadow: Bitmap?,
        val subjectLeft: Int,
        val subjectTop: Int,
        /** Débordement de l'ombre autour du sujet, en pixels de l'image préparée. */
        val shadowPad: Float,
    ) {
        fun recycle() {
            background.recycle()
            subject?.recycle()
            shadow?.recycle()
        }
    }

    private val paint = Paint(Paint.FILTER_BITMAP_FLAG)
    private val shadowPaint = Paint(Paint.FILTER_BITMAP_FLAG).apply { alpha = SHADOW_ALPHA }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val tilt = TiltSensor(context) { requestFrame() }
    private val layout = ReliefLayout()
    private val backgroundRect = RectF()
    private val subjectRect = RectF()
    private val shadowRect = RectF()
    private var layers: Layers? = null
    private var settings = ReliefSettings()

    // Fichier affiché ou en cours de chargement (le numéro écarte les chargements devenus inutiles).
    private var wantedKey: String? = null
    private var loadTicket = 0

    // Inclinaison affichée, qui rejoint en douceur celle voulue par le capteur.
    private var currentX = 0f
    private var currentY = 0f
    private var moving = false

    override fun onSize(width: Int, height: Int) {
        configureLayout()
        refresh()
    }

    override fun onRunningChanged(running: Boolean) {
        if (running) {
            tilt.start()
            refresh()
        } else {
            tilt.stop()
        }
    }

    override fun onSettingsChanged() = refresh()

    override fun onSurfaceDestroyed() {
        tilt.stop()
        super.onSurfaceDestroyed()
    }

    override fun release() {
        super.release()
        tilt.stop()
        scope.cancel()
        loadTicket++
        layers?.recycle()
        layers = null
    }

    /** Relit les réglages (profondeur, ombre) et recharge les images si le relief préparé a changé. */
    private fun refresh() {
        val newSettings = ReliefSettings.from(LiveWallpaperStore.sceneSettings(context, LiveMode.RELIEF))
        if (newSettings != settings) {
            settings = newSettings
            configureLayout()
            drawNow()
        }
        val prepared = ReliefStore.read(context)
        val key = prepared?.background ?: LiveWallpaperStore.read(context).shownPath
        if (width == 0 || height == 0 || key == wantedKey) return
        wantedKey = key
        val ticket = ++loadTicket
        if (key == null) {
            install(null)
            return
        }
        scope.launch {
            val loaded = withContext(Dispatchers.IO) { load(key, prepared) }
            if (ticket != loadTicket) {
                loaded?.recycle()
                return@launch
            }
            // Échec (mémoire) : l'image précédente reste affichée.
            if (loaded != null) install(loaded)
        }
    }

    private fun install(loaded: Layers?) {
        layers?.recycle()
        layers = loaded
        configureLayout()
        drawNow()
    }

    private fun configureLayout() {
        val current = layers ?: return
        if (width == 0 || height == 0) return
        layout.configure(
            screenWidth = width,
            screenHeight = height,
            imageWidth = current.background.width,
            imageHeight = current.background.height,
            subjectLeft = current.subjectLeft,
            subjectTop = current.subjectTop,
            subjectWidth = current.subject?.width ?: 0,
            subjectHeight = current.subject?.height ?: 0,
            shadowPad = current.shadowPad,
            depth = settings.depth,
        )
    }

    /**
     * Charge l'arrière-plan et le sujet du relief préparé, ou à défaut la photo [key] seule. N'utilise pas
     * l'état de la scène : appelable hors du fil d'affichage.
     */
    private fun load(key: String, prepared: ReliefStore.Prepared?): Layers? = try {
        val background = BitmapFactory.decodeFile(prepared?.background ?: key)
        val subject = prepared?.let { BitmapFactory.decodeFile(it.subject) }
        when {
            background == null -> {
                subject?.recycle()
                null
            }
            prepared == null || subject == null -> Layers(background, null, null, 0, 0, 0f)
            else -> {
                val (shadow, pad) = shadowOf(subject, background.width)
                Layers(background, subject, shadow, prepared.subjectLeft, prepared.subjectTop, pad)
            }
        }
    } catch (e: OutOfMemoryError) {
        null
    }

    /** Ombre du sujet, calculée en petit (elle est floue) ; renvoie aussi son débordement en pixels d'image. */
    private fun shadowOf(subject: Bitmap, imageWidth: Int): Pair<Bitmap, Float> {
        val w = max(1, subject.width / SHADOW_SCALE)
        val h = max(1, subject.height / SHADOW_SCALE)
        val small = subject.scale(w, h)
        val alpha = IntArray(w * h)
        small.getPixels(alpha, 0, w, 0, 0, w, h)
        if (small !== subject) small.recycle()
        for (i in alpha.indices) alpha[i] = alpha[i] ushr 24
        val radius = max(2, (imageWidth * SHADOW_BLUR / SHADOW_SCALE).roundToInt())
        val pixels = ReliefMask.shadow(alpha, w, h, radius)
        val shadow = Bitmap.createBitmap(pixels, w + 2 * radius, h + 2 * radius, Bitmap.Config.ARGB_8888)
        return shadow to radius * subject.width.toFloat() / w
    }

    override fun advance(frameTimeNanos: Long): Boolean {
        val previousX = currentX
        val previousY = currentY
        currentX = ParallaxMath.smooth(currentX, tilt.targetX)
        currentY = ParallaxMath.smooth(currentY, tilt.targetY)
        // Le sujet bouge le plus : on s'arrête quand son déplacement ne se voit plus.
        moving = abs(currentX - previousX) * layout.subjectTravelX > 0.25f || abs(currentY - previousY) * layout.subjectTravelY > 0.25f
        return moving
    }

    override fun isAnimating(): Boolean = moving

    override fun drawScene(canvas: Canvas, frameTimeNanos: Long) {
        canvas.drawColor(Color.BLACK)
        val current = layers ?: return
        layout.update(currentX, currentY)
        backgroundRect.set(layout.background[0], layout.background[1], layout.background[2], layout.background[3])
        canvas.drawBitmap(current.background, null, backgroundRect, paint)
        val subject = current.subject ?: return
        val shadow = current.shadow
        if (settings.shadow && shadow != null) {
            shadowRect.set(layout.shadow[0], layout.shadow[1], layout.shadow[2], layout.shadow[3])
            canvas.drawBitmap(shadow, null, shadowRect, shadowPaint)
        }
        subjectRect.set(layout.subject[0], layout.subject[1], layout.subject[2], layout.subject[3])
        canvas.drawBitmap(subject, null, subjectRect, paint)
    }

    private companion object {
        /** L'ombre est calculée au quart de la taille du sujet. */
        const val SHADOW_SCALE = 4

        /** Flou de l'ombre (fraction de la largeur de l'image). */
        const val SHADOW_BLUR = 0.012f

        /** Opacité de l'ombre (sur 255). */
        const val SHADOW_ALPHA = 90
    }
}
