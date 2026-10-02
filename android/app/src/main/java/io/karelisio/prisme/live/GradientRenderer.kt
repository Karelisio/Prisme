package io.karelisio.prisme.live

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Shader
import android.os.Build
import androidx.annotation.RequiresApi
import androidx.core.content.edit
import androidx.core.graphics.createBitmap
import androidx.core.graphics.withTranslation
import java.nio.ByteBuffer
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.roundToInt
import kotlin.random.Random

/**
 * Peint le dégradé animé dans une petite image (1/[SCALE] de l'écran), agrandie ensuite avec un filtrage
 * bilinéaire : très doux et peu coûteux. Chaque tache est un masque en cloche (ALPHA_8) teinté par la
 * couleur du pinceau et mélangé en mode « écran » : changer de couleur (fondu entre palettes) ne crée
 * aucun objet.
 */
internal class GradientRenderer {
    private val mask: Bitmap = createMask()
    private var small: Bitmap? = null
    private val smallCanvas = Canvas()
    private val blobPaint = Paint(Paint.FILTER_BITMAP_FLAG).apply { xfermode = PorterDuffXfermode(PorterDuff.Mode.SCREEN) }
    private val upscalePaint = Paint(Paint.FILTER_BITMAP_FLAG)
    private val maskRect = RectF(-1f, -1f, 1f, 1f)
    private val target = Rect()
    private val pose = FloatArray(GradientMotion.POSE_SIZE)

    /** Écran de [width] × [height] px : la petite image est recréée si sa taille change. */
    fun resize(width: Int, height: Int) {
        target.set(0, 0, width, height)
        val w = max(1, ceil(width / SCALE).toInt())
        val h = max(1, ceil(height / SCALE).toInt())
        val current = small
        if (current != null && current.width == w && current.height == h) return
        if (current != null) {
            smallCanvas.setBitmap(null)
            current.recycle()
        }
        small = try {
            createBitmap(w, h).also { smallCanvas.setBitmap(it) }
        } catch (e: OutOfMemoryError) {
            null
        }
    }

    /**
     * Peint le dégradé au temps d'animation [time] (s). Pendant un fondu, les couleurs passent de [from]
     * à [to] ([mix] de 0 à 1). [gain] atténue les taches (fond sombre sous des particules).
     */
    fun render(to: MotionPalette, from: MotionPalette?, mix: Float, time: Double, gain: Float = 1f) {
        val bitmap = small ?: return
        val w = bitmap.width.toFloat()
        val h = bitmap.height.toFloat()
        val k = if (from == null) 1f else mix.coerceIn(0f, 1f)
        smallCanvas.drawColor(if (from == null) to.base else MotionPalettes.lerpColor(from.base, to.base, k), PorterDuff.Mode.SRC)
        val paletteGain = if (from == null) to.gain else from.gain + (to.gain - from.gain) * k
        for (i in 0 until GradientMotion.BLOBS.size) {
            val blob = GradientMotion.BLOBS[i]
            GradientMotion.pose(blob, time, pose)
            blobPaint.color = if (from == null) to.color(i) else MotionPalettes.lerpColor(from.color(i), to.color(i), k)
            blobPaint.alpha = (blob.alpha * paletteGain * gain * 255f).roundToInt().coerceIn(0, 255)
            smallCanvas.withTranslation(pose[GradientMotion.X] * w, pose[GradientMotion.Y] * h) {
                rotate(pose[GradientMotion.ANGLE])
                scale(pose[GradientMotion.RX] * w, pose[GradientMotion.RY] * w)
                drawBitmap(mask, null, maskRect, blobPaint)
            }
        }
    }

    /** Agrandit la dernière image peinte sur tout l'écran. */
    fun draw(canvas: Canvas) {
        val bitmap = small ?: return
        canvas.drawBitmap(bitmap, null, target, upscalePaint)
    }

    fun release() {
        smallCanvas.setBitmap(null)
        small?.recycle()
        small = null
        mask.recycle()
    }

    private companion object {
        /** Réduction de la petite image : les taches sont si floues que 1/8 suffit. */
        const val SCALE = 8f
        const val MASK_SIZE = 128

        fun createMask(): Bitmap {
            val bytes = ByteArray(MASK_SIZE * MASK_SIZE)
            val center = (MASK_SIZE - 1) / 2f
            for (y in 0 until MASK_SIZE) {
                for (x in 0 until MASK_SIZE) {
                    val s = hypot(x - center, y - center) / (MASK_SIZE / 2f)
                    bytes[y * MASK_SIZE + x] = (GradientMotion.profile(s) * 255f).roundToInt().toByte()
                }
            }
            return createBitmap(MASK_SIZE, MASK_SIZE, Bitmap.Config.ALPHA_8).apply { copyPixelsFromBuffer(ByteBuffer.wrap(bytes)) }
        }
    }
}

/**
 * Grain léger par-dessus un dégradé : un bruit fixe, à peine visible, qui casse les bandes de couleur des
 * dégradés sombres (petite texture répétée sur tout l'écran).
 */
internal class Grain {
    private val bitmap: Bitmap = createNoise()
    private val paint = Paint().apply { shader = BitmapShader(bitmap, Shader.TileMode.REPEAT, Shader.TileMode.REPEAT) }

    fun draw(canvas: Canvas, width: Int, height: Int) {
        canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), paint)
    }

    fun release() {
        paint.shader = null
        bitmap.recycle()
    }

    private companion object {
        const val SIZE = 128

        /** Opacité maximale d'un grain (sur 255). */
        const val AMPLITUDE = 7

        fun createNoise(): Bitmap {
            val random = Random(7)
            val pixels = IntArray(SIZE * SIZE) {
                val v = random.nextFloat() * 2f - 1f
                val alpha = (abs(v) * AMPLITUDE).roundToInt()
                (alpha shl 24) or (if (v > 0f) 0xFFFFFF else 0)
            }
            return Bitmap.createBitmap(pixels, SIZE, SIZE, Bitmap.Config.ARGB_8888)
        }
    }
}

/** Palette « Material You » : couleurs du système (Android 12+), sinon tirée de la couleur d'accent de l'app. */
internal object SystemPalette {
    fun read(context: Context, accent: Int): MotionPalette =
        if (Build.VERSION.SDK_INT >= 31) fromSystem(context) else MotionPalettes.fromAccent(accent)

    /** Palette d'une clé ([MotionPalettes.KEYS]). */
    fun resolve(context: Context, key: String, accent: Int): MotionPalette =
        if (key == MotionPalettes.SYSTEM) read(context, accent) else MotionPalettes.preset(key) ?: MotionPalettes.PRESETS.first()

    @RequiresApi(31)
    private fun fromSystem(context: Context): MotionPalette = MotionPalettes.fromSystem(
        accent1Tone300 = context.getColor(android.R.color.system_accent1_300),
        accent1Tone500 = context.getColor(android.R.color.system_accent1_500),
        accent2Tone500 = context.getColor(android.R.color.system_accent2_500),
        accent3Tone400 = context.getColor(android.R.color.system_accent3_400),
        accent3Tone600 = context.getColor(android.R.color.system_accent3_600),
        accent1Tone900 = context.getColor(android.R.color.system_accent1_900),
    )
}

/**
 * État écrit par le service, à part des réglages de l'app (qui remplacent leur JSON en entier) : palette
 * choisie au double-tap sur le dégradé, et la palette réglée dans l'app d'où elle est partie.
 */
internal object MotionState {
    private const val PREFS = "prisme_live_motion"
    private const val KEY_FROM = "gradient_cycled_from"
    private const val KEY_PALETTE = "gradient_cycled"

    fun shownPalette(context: Context, setting: String): String {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        return GradientMotion.shownPalette(setting, prefs.getString(KEY_FROM, null), prefs.getString(KEY_PALETTE, null))
    }

    fun saveCycled(context: Context, from: String, palette: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit {
            putString(KEY_FROM, from)
            putString(KEY_PALETTE, palette)
        }
    }
}
