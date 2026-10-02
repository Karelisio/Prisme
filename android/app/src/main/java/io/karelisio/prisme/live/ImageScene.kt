package io.karelisio.prisme.live

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import androidx.core.graphics.scale
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.math.abs

/**
 * Photo avec parallaxe : l'image glisse légèrement selon l'inclinaison du téléphone, comme si elle était
 * derrière l'écran. Avec une liste active (déverrouillage, double-tap), l'image change en fondu enchaîné.
 */
internal class ImageScene(context: Context) : CanvasScene(context) {
    private val paint = Paint(Paint.FILTER_BITMAP_FLAG)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val tilt = TiltSensor(context) { requestFrame() }
    private var bitmap: Bitmap? = null
    private var loadedPath: String? = null
    private var margin = ParallaxMath.margin(LiveWallpaperStore.DEFAULT_INTENSITY)

    // Changement d'image : chargement en cours (le numéro écarte les résultats devenus inutiles),
    // puis fondu depuis l'ancienne image (début à 0 tant que la première image du fondu n'est pas passée).
    private var pendingPath: String? = null
    private var loadTicket = 0
    private var fadeFrom: Bitmap? = null
    private var fadeStartNanos = 0L
    private var fadeAlpha = FULL_ALPHA

    // Décalage affiché, qui rejoint en douceur celui voulu par le capteur.
    private var currentX = 0f
    private var currentY = 0f
    private var moving = false

    override fun onSize(width: Int, height: Int) {
        loadedPath = null
        refresh(immediate = true)
    }

    override fun onRunningChanged(running: Boolean) {
        if (running) {
            tilt.start()
            refresh()
        } else {
            tilt.stop()
            // Fondu interrompu : la nouvelle image reste seule affichée.
            finishFade()
        }
    }

    override fun onSettingsChanged() = refresh()

    override fun onSurfaceDestroyed() {
        tilt.stop()
        finishFade()
        super.onSurfaceDestroyed()
    }

    override fun release() {
        super.release()
        tilt.stop()
        scope.cancel()
        finishFade()
        bitmap?.recycle()
        bitmap = null
    }

    /**
     * Affiche l'image voulue par la configuration. Sans liste active : chargée et affichée tout de suite.
     * Avec une liste active, les changements d'image se font hors du fil d'affichage, puis apparaissent en
     * fondu quand le fond est visible ; la première image et le changement de taille ([immediate]) restent
     * immédiats.
     */
    private fun refresh(immediate: Boolean = false) {
        val config = LiveWallpaperStore.read(context)
        val newMargin = ParallaxMath.margin(config.intensity)
        val marginChanged = newMargin != margin
        margin = newMargin
        val path = config.shownPath
        if (width == 0 || height == 0 || path == null || path == loadedPath) {
            // Rien de nouveau à afficher : un chargement encore en cours serait périmé.
            cancelPending()
            if (marginChanged) drawNow()
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
            if (result != null) install(result.first, result.second, fade = running)
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

    /** Décode l'image à la taille voulue. N'utilise pas l'état de la scène : appelable hors du fil d'affichage. */
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
            requestFrame()
        } else {
            previous?.recycle()
        }
        drawNow()
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

    override fun advance(frameTimeNanos: Long): Boolean {
        val fading = fadeFrom != null
        if (fading) {
            if (fadeStartNanos == 0L) fadeStartNanos = frameTimeNanos
            fadeAlpha = UnlockPlaylist.fadeAlpha((frameTimeNanos - fadeStartNanos) / NANOS_PER_MS)
        }
        val previousX = currentX
        val previousY = currentY
        currentX = ParallaxMath.smooth(currentX, tilt.targetX)
        currentY = ParallaxMath.smooth(currentY, tilt.targetY)
        moving = abs(currentX - previousX) * width * margin > 0.25f || abs(currentY - previousY) * height * margin > 0.25f
        return moving || fading
    }

    override fun isAnimating(): Boolean = moving || fadeFrom != null

    override fun drawScene(canvas: Canvas, frameTimeNanos: Long) {
        canvas.drawColor(Color.BLACK)
        val image = bitmap ?: return
        val left = ParallaxMath.drawOffset(currentX, width * margin)
        val top = ParallaxMath.drawOffset(currentY, height * margin)
        val previous = fadeFrom
        if (previous != null) {
            // Fondu enchaîné : l'ancienne image, puis la nouvelle de plus en plus opaque par-dessus.
            canvas.drawBitmap(previous, left, top, paint)
            paint.alpha = fadeAlpha
            canvas.drawBitmap(image, left, top, paint)
            paint.alpha = FULL_ALPHA
            if (fadeAlpha >= FULL_ALPHA) finishFade()
        } else {
            canvas.drawBitmap(image, left, top, paint)
        }
    }

    private companion object {
        const val FULL_ALPHA = 255
        const val NANOS_PER_MS = 1_000_000L
    }
}
