package io.karelisio.prisme.live

import android.content.Context
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ImageDecoder
import android.graphics.Paint
import android.graphics.drawable.AnimatedImageDrawable
import android.graphics.drawable.Drawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.annotation.RequiresApi
import io.karelisio.prisme.system.ErrorLog
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import kotlin.math.roundToInt

/**
 * GIF animé (ou WebP animé, à partir d'Android 9) en fond : ajusté pour couvrir l'écran, centré, ce qui dépasse
 * est recadré. Le fichier est celui que l'app a copié dans files/live/media ([MediaKind.GIF]). Figé sur son
 * image courante quand le fond est masqué ou en pause (économie d'énergie). Un fichier illisible ne plante
 * jamais le service : le fond reste noir et l'erreur est enregistrée dans le journal.
 */
internal class GifScene(context: Context) : CanvasScene(context) {
    override val maxFps: Int = 30

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val handler = Handler(Looper.getMainLooper())
    private val paint = Paint(Paint.FILTER_BITMAP_FLAG)
    private var frames: GifFrames? = null
    private var background = Color.BLACK
    private var placement: CoverFit.Placement? = null

    // Chargement en cours ou terminé pour ce choix (le numéro écarte les résultats devenus inutiles) : un fichier
    // illisible n'est pas relu en boucle, seulement quand un autre est choisi.
    private var requestedStamp = NO_STAMP
    private var loadTicket = 0

    override fun onSize(width: Int, height: Int) {
        placement = frames?.let { CoverFit.place(it.width, it.height, width, height) }
        refresh()
    }

    override fun onSettingsChanged() = refresh()

    override fun onRunningChanged(running: Boolean) {
        val current = frames ?: return
        if (running) current.start() else current.stop()
    }

    /** Un GIF n'a pas de variante : le double-tap ne change rien (et ne fait pas avancer la liste d'images de la photo). */
    override fun onDoubleTap(): Boolean = true

    override fun release() {
        super.release()
        loadTicket++
        scope.cancel()
        handler.removeCallbacksAndMessages(null)
        frames?.release()
        frames = null
    }

    /** Charge le GIF choisi dans l'app s'il a changé depuis le dernier chargement. */
    private fun refresh() {
        if (width == 0 || height == 0) return
        val info = LiveMedia.ready(context, MediaKind.GIF)
        if (info == null) {
            // Plus de fichier (supprimé, ou jamais choisi) : fond noir.
            if (requestedStamp != NO_STAMP || frames != null) {
                requestedStamp = NO_STAMP
                loadTicket++
                install(null)
            }
            return
        }
        if (info.stamp == requestedStamp) return
        requestedStamp = info.stamp
        val ticket = ++loadTicket
        val file = LiveMedia.file(context, info)
        val screenWidth = width
        val screenHeight = height
        scope.launch {
            val loaded = withContext(Dispatchers.IO) { decode(file, screenWidth, screenHeight) }
            if (ticket != loadTicket) {
                loaded?.frames?.release()
                return@launch
            }
            install(loaded)
        }
    }

    private fun install(loaded: Loaded?) {
        val previous = frames
        frames = loaded?.frames
        background = loaded?.background ?: Color.BLACK
        placement = frames?.let { CoverFit.place(it.width, it.height, width, height) }
        previous?.release()
        if (running) frames?.start()
        drawNow()
        requestFrame()
    }

    private class Loaded(val frames: GifFrames, val background: Int)

    /** Décode le fichier, hors du fil d'affichage ; null (et erreur au journal) s'il est illisible. */
    private fun decode(file: File, screenWidth: Int, screenHeight: Int): Loaded? = try {
        val decoded = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) decodeAnimated(file, screenWidth, screenHeight) else decodeMovie(file)
        Loaded(decoded, runCatching { dominantColor(file) }.getOrNull() ?: Color.BLACK)
    } catch (e: Exception) {
        ErrorLog.record(context, "Fond GIF", e)
        null
    } catch (e: OutOfMemoryError) {
        ErrorLog.record(context, "Fond GIF", e)
        null
    }

    /** Android 9+ : le décodeur du système anime lui-même GIF et WebP ; réduit à la taille de l'écran pour borner la mémoire. */
    @RequiresApi(Build.VERSION_CODES.P)
    private fun decodeAnimated(file: File, screenWidth: Int, screenHeight: Int): GifFrames {
        val drawable = ImageDecoder.decodeDrawable(ImageDecoder.createSource(file)) { decoder, info, _ ->
            val (w, h) = CoverFit.decodeSize(info.size.width, info.size.height, screenWidth, screenHeight)
            decoder.setTargetSize(w, h)
        }
        return DrawableFrames(drawable, handler) { requestFrame() }
    }

    /** Android 8 et moins : seule android.graphics.Movie sait lire un GIF (voir [MovieFrames]). */
    private fun decodeMovie(file: File): GifFrames = MovieFrames.decode(file)

    /** Couleur dominante de la première image, vue très réduite ; null si elle ne peut pas être lue. */
    private fun dominantColor(file: File): Int? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.absolutePath, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / sample > COLOR_SAMPLE_SIDE) sample *= 2
        val bitmap = BitmapFactory.decodeFile(file.absolutePath, BitmapFactory.Options().apply { inSampleSize = sample }) ?: return null
        try {
            val pixels = IntArray(bitmap.width * bitmap.height)
            bitmap.getPixels(pixels, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
            return DominantColor.of(pixels)
        } finally {
            bitmap.recycle()
        }
    }

    override fun advance(frameTimeNanos: Long): Boolean {
        val current = frames ?: return false
        return try {
            current.advance(frameTimeNanos)
        } catch (e: RuntimeException) {
            fail(e)
            false
        }
    }

    override fun isAnimating(): Boolean = running && frames?.animated == true

    override fun drawScene(canvas: Canvas, frameTimeNanos: Long) {
        canvas.drawColor(background)
        val current = frames ?: return
        val to = placement ?: return
        try {
            current.draw(canvas, to, paint)
        } catch (e: RuntimeException) {
            fail(e)
        }
    }

    /** Le décodeur a échoué en cours de route : le GIF est abandonné (fond noir), sans faire tomber le service. */
    private fun fail(error: Throwable) {
        ErrorLog.record(context, "Fond GIF", error)
        frames?.release()
        frames = null
        placement = null
    }

    private companion object {
        const val NO_STAMP = Long.MIN_VALUE

        /** Côté de la vue réduite dont on tire la couleur dominante. */
        const val COLOR_SAMPLE_SIDE = 64
    }
}

/** Image animée décodée, quel que soit le décodeur : ce que [GifScene] dessine. */
internal interface GifFrames {
    val width: Int
    val height: Int

    /** Plusieurs images : la scène demande des images en boucle tant qu'elle tourne. */
    val animated: Boolean

    /** Le fond redevient visible : l'animation repart de l'image où elle s'était arrêtée. */
    fun start()

    /** Le fond est masqué ou en pause : l'animation s'arrête sur son image courante. */
    fun stop()

    /** Fait avancer l'animation jusqu'à [frameTimeNanos] ; faux si l'image n'a pas changé. */
    fun advance(frameTimeNanos: Long): Boolean

    fun draw(canvas: Canvas, to: CoverFit.Placement, paint: Paint)

    fun release()
}

/**
 * Android 9+ : [AnimatedImageDrawable] (GIF, WebP animé) ou, pour une image fixe, un simple drawable. Le décodeur
 * choisit lui-même l'image à montrer ; elle est redessinée à la cadence de la scène.
 */
@RequiresApi(Build.VERSION_CODES.P)
private class DrawableFrames(
    private val drawable: Drawable,
    private val handler: Handler,
    private val onInvalidate: () -> Unit,
) : GifFrames, Drawable.Callback {
    private val animatedDrawable = drawable as? AnimatedImageDrawable
    private val invalidate = Runnable { onInvalidate() }

    override val width: Int = drawable.intrinsicWidth
    override val height: Int = drawable.intrinsicHeight
    override val animated: Boolean = animatedDrawable != null

    init {
        // Le drawable ne garde son rappel que faiblement : c'est cet objet, retenu par la scène, qui le tient.
        drawable.callback = this
        // Un GIF peut demander à ne jouer qu'une fois : en fond d'écran, il boucle toujours.
        animatedDrawable?.repeatCount = AnimatedImageDrawable.REPEAT_INFINITE
    }

    override fun start() {
        animatedDrawable?.start()
    }

    override fun stop() {
        animatedDrawable?.stop()
    }

    override fun advance(frameTimeNanos: Long): Boolean = animated

    override fun draw(canvas: Canvas, to: CoverFit.Placement, paint: Paint) {
        drawable.setBounds(to.left.roundToInt(), to.top.roundToInt(), (to.left + to.width).roundToInt(), (to.top + to.height).roundToInt())
        drawable.draw(canvas)
    }

    override fun release() {
        stop()
        drawable.callback = null
        handler.removeCallbacksAndMessages(drawable)
        handler.removeCallbacks(invalidate)
    }

    // Le drawable demande une nouvelle image (ou la programme) : ramené sur le fil principal, la scène la dessine.
    override fun invalidateDrawable(who: Drawable) {
        handler.post(invalidate)
    }

    override fun scheduleDrawable(who: Drawable, what: Runnable, `when`: Long) {
        handler.postAtTime(what, who, `when`)
    }

    override fun unscheduleDrawable(who: Drawable, what: Runnable) {
        handler.removeCallbacks(what, who)
    }
}
