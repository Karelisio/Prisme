package io.karelisio.prisme.live

import android.content.Context
import android.graphics.Canvas

/**
 * Dégradé animé : de grandes taches de couleur douces dérivent lentement sur une base sombre, façon aurore
 * boréale. Double-tap : palette suivante, en fondu. L'animation n'avance qu'à l'écran et reprend sans saut
 * après une pause.
 */
internal class GradientScene(context: Context) : CanvasScene(context) {
    private val renderer = GradientRenderer()
    private val grain = Grain()
    private val clock = MotionClock()
    private var settings: GradientMotion.Settings = readSettings()
    private var paletteKey = MotionState.shownPalette(context, settings.palette)
    private var palette = SystemPalette.resolve(context, paletteKey, settings.accent)

    // Fondu entre palettes : début à 0 tant que la première image du fondu n'est pas passée.
    private var fadeFrom: MotionPalette? = null
    private var fadeStartNanos = 0L
    private var fadeMix = 1f

    /** Temps de l'animation (s), qui n'avance qu'avec les images affichées. */
    private var time = 0.0

    override val maxFps: Int get() = if (fadeFrom != null) FADE_FPS else settings.speed.fps

    private fun readSettings() = GradientMotion.settings(LiveWallpaperStore.sceneSettings(context, LiveMode.GRADIENT))

    override fun onSize(width: Int, height: Int) = renderer.resize(width, height)

    override fun onRunningChanged(running: Boolean) {
        clock.pause()
        if (running) {
            // Couleurs du système peut-être changées pendant que le fond était masqué.
            if (paletteKey == MotionPalettes.SYSTEM && fadeFrom == null) palette = SystemPalette.resolve(context, paletteKey, settings.accent)
        } else {
            finishFade()
        }
    }

    override fun onSettingsChanged() {
        val previous = settings
        settings = readSettings()
        val key = MotionState.shownPalette(context, settings.palette)
        val accentChanged = key == MotionPalettes.SYSTEM && previous.accent != settings.accent
        if (key != paletteKey || accentChanged) {
            changePalette(key)
        } else if (previous.grain != settings.grain && !running) {
            drawNow()
        }
    }

    /** Double-tap : palette suivante, retenue tant que la palette n'est pas changée dans l'app. */
    override fun onDoubleTap(): Boolean {
        val next = MotionPalettes.next(paletteKey)
        MotionState.saveCycled(context, settings.palette, next)
        changePalette(next)
        return true
    }

    private fun changePalette(key: String) {
        val target = SystemPalette.resolve(context, key, settings.accent)
        // Fondu interrompu : il repart des couleurs affichées à cet instant.
        val shown = fadeFrom?.let { mixed(it, palette, fadeMix) } ?: palette
        paletteKey = key
        palette = target
        if (running) {
            fadeFrom = shown
            fadeStartNanos = 0L
            fadeMix = 0f
            requestFrame()
        } else {
            finishFade()
            drawNow()
        }
    }

    private fun finishFade() {
        fadeFrom = null
        fadeMix = 1f
    }

    override fun advance(frameTimeNanos: Long): Boolean {
        time += clock.tick(frameTimeNanos) * settings.speed.factor
        if (fadeFrom != null) {
            if (fadeStartNanos == 0L) fadeStartNanos = frameTimeNanos
            fadeMix = GradientMotion.fade((frameTimeNanos - fadeStartNanos) / NANOS_PER_MS)
        }
        return true
    }

    override fun isAnimating(): Boolean = true

    override fun drawScene(canvas: Canvas, frameTimeNanos: Long) {
        renderer.render(palette, fadeFrom, fadeMix, time)
        renderer.draw(canvas)
        if (settings.grain) grain.draw(canvas, width, height)
        if (fadeFrom != null && fadeMix >= 1f) finishFade()
    }

    override fun release() {
        super.release()
        renderer.release()
        grain.release()
    }

    private companion object {
        /** Cadence pendant le fondu entre palettes, plus rapide que le mouvement des taches. */
        const val FADE_FPS = 30
        const val NANOS_PER_MS = 1_000_000L

        /** Couleurs affichées au milieu d'un fondu (seulement quand un nouveau fondu l'interrompt). */
        fun mixed(from: MotionPalette, to: MotionPalette, mix: Float) = MotionPalette(
            to.key,
            MotionPalettes.lerpColor(from.base, to.base, mix),
            IntArray(to.colors.size) { MotionPalettes.lerpColor(from.color(it), to.color(it), mix) },
            from.gain + (to.gain - from.gain) * mix,
        )
    }
}
