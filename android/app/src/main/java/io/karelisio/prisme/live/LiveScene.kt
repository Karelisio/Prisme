package io.karelisio.prisme.live

import android.content.Context
import android.graphics.Canvas
import android.os.Build
import android.view.Choreographer
import android.view.MotionEvent
import android.view.SurfaceHolder

/**
 * Ce que dessine un genre de fond animé ([LiveMode]). Le moteur du service crée la scène du genre choisi
 * et lui transmet les événements, toujours sur le fil principal.
 */
internal interface LiveScene {
    /** La scène reçoit les touchers de l'écran d'accueil (particules). */
    val wantsTouch: Boolean get() = false

    /** Surface prête, ou nouvelle taille. */
    fun onSurface(holder: SurfaceHolder, width: Int, height: Int)

    fun onSurfaceDestroyed()

    /**
     * Vrai : fond visible et pas en pause (économie d'énergie) ; la scène s'anime. Faux : elle s'arrête et
     * reste figée sur sa dernière image (capteurs et lecture coupés).
     */
    fun onRunning(running: Boolean)

    /** Réglages de la scène modifiés dans l'app. */
    fun onSettingsChanged()

    fun onTouch(event: MotionEvent) = Unit

    /** Double-tap sur l'écran d'accueil ; vrai si la scène s'en charge (sinon : image suivante de la liste). */
    fun onDoubleTap(): Boolean = false

    fun release()
}

/** Couche dessinée par-dessus une scène (météo animée). */
internal interface SceneOverlay {
    /** [invalidate] redemande une image à la scène (nouvelle météo reçue, réglage modifié). */
    fun attach(invalidate: () -> Unit) = Unit

    fun onSize(width: Int, height: Int)

    fun onRunning(running: Boolean)

    /** Réglages modifiés dans l'app. */
    fun onSettingsChanged() = Unit

    /** Vrai tant que la couche bouge : la scène continue alors à demander des images. */
    fun isAnimating(): Boolean

    fun draw(canvas: Canvas, frameTimeNanos: Long)

    fun release()
}

/**
 * Scène dessinée au canevas, image par image : boucle Choreographer limitée à [maxFps], arrêtée dès que
 * rien ne bouge, que le fond est masqué ou en pause. Une couche [overlay] peut s'ajouter par-dessus.
 */
internal abstract class CanvasScene(protected val context: Context) : LiveScene, Choreographer.FrameCallback {
    protected var width = 0
        private set
    protected var height = 0
        private set
    protected var running = false
        private set
    private var holder: SurfaceHolder? = null
    private var frameScheduled = false
    private var lastFrameNanos = 0L

    /** Images par seconde au plus pendant une animation. */
    protected open val maxFps: Int = 60

    var overlay: SceneOverlay? = null
        set(value) {
            if (field === value) return
            field?.release()
            field = value
            value?.attach { if (running) requestFrame() else drawNow() }
            value?.onSize(width, height)
            value?.onRunning(running)
            requestFrame()
        }

    /** Dessine toute l'image ([frameTimeNanos] : horloge de Choreographer, comme [System.nanoTime]). */
    protected abstract fun drawScene(canvas: Canvas, frameTimeNanos: Long)

    /** Vrai tant que la scène bouge (animation continue, fondu, mouvement amorti en cours). */
    protected abstract fun isAnimating(): Boolean

    protected open fun onSize(width: Int, height: Int) = Unit

    protected open fun onRunningChanged(running: Boolean) = Unit

    final override fun onSurface(holder: SurfaceHolder, width: Int, height: Int) {
        this.holder = holder
        this.width = width
        this.height = height
        onSize(width, height)
        overlay?.onSize(width, height)
        drawNow()
        requestFrame()
    }

    override fun onSurfaceDestroyed() {
        cancelFrame()
        holder = null
    }

    final override fun onRunning(running: Boolean) {
        if (this.running == running) return
        this.running = running
        onRunningChanged(running)
        overlay?.onRunning(running)
        if (running) {
            lastFrameNanos = 0L
            requestFrame()
        } else {
            cancelFrame()
            // Figée : la dernière image reste, nette (fondu terminé…).
            drawNow()
        }
    }

    override fun release() {
        cancelFrame()
        overlay?.release()
        overlay = null
        holder = null
    }

    /** Demande une image à la prochaine synchronisation, si la scène tourne. */
    protected fun requestFrame() {
        if (frameScheduled || !running || holder == null) return
        frameScheduled = true
        Choreographer.getInstance().postFrameCallback(this)
    }

    private fun cancelFrame() {
        if (frameScheduled) Choreographer.getInstance().removeFrameCallback(this)
        frameScheduled = false
    }

    override fun doFrame(frameTimeNanos: Long) {
        frameScheduled = false
        if (!running) return
        val interval = 1_000_000_000L / maxFps.coerceIn(1, 120)
        val elapsed = frameTimeNanos - lastFrameNanos
        if (lastFrameNanos != 0L && elapsed < interval - FRAME_SLACK_NANOS) {
            // Trop tôt pour la cadence voulue : on attend sans dessiner.
            frameScheduled = true
            Choreographer.getInstance().postFrameCallbackDelayed(this, ((interval - elapsed) / 1_000_000L).coerceAtLeast(1L))
            return
        }
        lastFrameNanos = frameTimeNanos
        val changed = advance(frameTimeNanos)
        val overlayMoving = overlay?.isAnimating() == true
        if (changed || overlayMoving) render(frameTimeNanos)
        if (isAnimating() || overlayMoving) requestFrame()
    }

    /**
     * Fait avancer l'animation jusqu'à [frameTimeNanos] ; faux si l'image n'a pas changé de façon visible
     * (elle n'est alors pas redessinée, sauf pour la couche par-dessus).
     */
    protected open fun advance(frameTimeNanos: Long): Boolean = true

    /** Redessine tout de suite (réglage modifié, scène figée). */
    protected fun drawNow() = render(System.nanoTime())

    private fun render(frameTimeNanos: Long) {
        val holder = holder ?: return
        var canvas: Canvas? = null
        try {
            canvas = if (Build.VERSION.SDK_INT >= 26) holder.lockHardwareCanvas() else holder.lockCanvas()
            if (canvas == null) return
            drawScene(canvas, frameTimeNanos)
            overlay?.draw(canvas, frameTimeNanos)
        } catch (e: IllegalStateException) {
            // Surface en cours de destruction : l'image suivante sera dessinée plus tard.
        } catch (e: IllegalArgumentException) {
            // Surface déjà libérée.
        } finally {
            if (canvas != null) runCatching { holder.unlockCanvasAndPost(canvas) }
        }
    }

    private companion object {
        /** Tolérance : une synchronisation un peu en avance compte quand même. */
        const val FRAME_SLACK_NANOS = 2_000_000L
    }
}
