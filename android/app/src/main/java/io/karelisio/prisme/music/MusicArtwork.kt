package io.karelisio.prisme.music

import android.content.Context
import android.graphics.Bitmap
import androidx.core.app.NotificationManagerCompat
import io.karelisio.prisme.automation.AutomationScheduler
import io.karelisio.prisme.automation.AutomationStore
import io.karelisio.prisme.system.ErrorLog
import io.karelisio.prisme.wallpaper.AppliedWallpapers
import io.karelisio.prisme.wallpaper.ImageStore
import io.karelisio.prisme.wallpaper.ScreenInfo
import io.karelisio.prisme.wallpaper.WallpaperApplier
import io.karelisio.prisme.wallpaper.WallpaperRef
import io.karelisio.prisme.wallpaper.WallpaperTarget
import java.io.File

/**
 * Pochette de la musique : pose l'image composée en fond d'écran, puis rend le fond précédent.
 * Les changements d'état passent tous par un même verrou (le service d'écoute et le plugin
 * agissent depuis des fils différents).
 */
internal object MusicArtwork {
    private val lock = Any()

    /** Une pochette est posée : les automatismes ne doivent pas l'écraser (voir AutomationRunner). */
    fun isShowing(context: Context): Boolean = MusicState(context).showing

    /** Android montre les sessions média aux seules applis autorisées à lire les notifications. */
    fun accessGranted(context: Context): Boolean =
        NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)

    /** Réglages envoyés par l'app. Couper l'option pendant l'affichage d'une pochette rend le fond précédent. */
    fun configure(context: Context, enabled: Boolean, target: WallpaperTarget, restore: Boolean) {
        synchronized(lock) {
            val state = MusicState(context)
            // Autre écran visé pendant l'affichage : le morceau en cours sera reposé là où il faut.
            if (state.showing && target != state.target) state.lastKey = null
            state.configure(enabled, target, restore)
            when {
                !state.showing -> Unit
                !enabled -> restoreLocked(context, state)
                // Accès retiré pendant l'affichage : plus personne ne dira quand la musique s'arrête.
                !accessGranted(context) -> finishLocked(context, state)
                else -> Unit
            }
        }
        // Option activée pendant qu'une musique joue : pas besoin d'attendre le prochain morceau.
        MusicListenerService.refresh()
    }

    /** Pose la pochette du morceau [key] ; sans effet si c'est déjà celle qui est affichée ou si l'option est coupée. */
    fun show(context: Context, key: String, art: Bitmap) {
        synchronized(lock) {
            val state = MusicState(context)
            if (!MusicRules.shouldApply(state.enabled, true, key, state.lastKey)) return
            val screen = ScreenInfo.read(context, null)
            val target = state.target
            val file = compose(context, art, screen)
            val wasShowing = state.showing
            // Les automatismes se taisent avant l'application, pour qu'aucun ne passe entre-temps.
            if (!wasShowing) state.showing = true
            var applied = false
            try {
                WallpaperApplier(context).apply(file, target, null, screen)
                applied = true
            } finally {
                if (!applied && !wasShowing) state.showing = false
            }
            state.markShown(key, target)
            ArtworkFiles.prune(context, keep = file)
        }
    }

    /** Fin de l'affichage : la musique est arrêtée depuis assez longtemps, ou l'accès a été retiré. */
    fun finish(context: Context) {
        synchronized(lock) {
            val state = MusicState(context)
            if (state.showing) finishLocked(context, state)
        }
    }

    private fun compose(context: Context, art: Bitmap, screen: ScreenInfo.Size): File {
        val bitmap = ArtworkComposer.compose(art, screen)
        try {
            return ArtworkFiles.write(context, bitmap)
        } finally {
            bitmap.recycle()
        }
    }

    private fun finishLocked(context: Context, state: MusicState) {
        if (state.restore) restoreLocked(context, state) else end(context, state)
    }

    /** Sans retour au fond précédent, la pochette reste en place comme un fond ordinaire. */
    private fun end(context: Context, state: MusicState) {
        state.markEnded()
        ArtworkFiles.prune(context)
    }

    /**
     * Rend le fond précédent sur les écrans touchés : d'abord le dernier fond choisi à la main (il manque
     * aux écrans que les automatismes laissent tels quels), puis les automatismes actifs reprennent la main.
     */
    private fun restoreLocked(context: Context, state: MusicState) {
        val screens = state.touched ?: state.target
        // Le drapeau tombe d'abord : le moteur d'automatismes ignore toute exécution tant qu'une pochette est affichée.
        end(context, state)
        restoreManual(context, screens)
        if (AutomationStore(context).config().anyEnabled) AutomationScheduler.runNow(context, force = true)
    }

    private fun restoreManual(context: Context, target: WallpaperTarget) {
        val applied = AppliedWallpapers(context)
        val home = if (target == WallpaperTarget.LOCK) null else applied.lastManual(WallpaperTarget.HOME)
        val lockScreen = if (target == WallpaperTarget.HOME) null else applied.lastManual(WallpaperTarget.LOCK)
        if (home == null && lockScreen == null) return
        val screen = ScreenInfo.read(context, null)
        val applier = WallpaperApplier(context)
        val images = ImageStore(context)
        // Un écran en échec (image purgée du cache, hors ligne…) n'empêche pas l'autre.
        fun put(ref: WallpaperRef, to: WallpaperTarget) {
            try {
                applier.apply(images.resolve(ref.uri), to, ref.crop, screen)
            } catch (e: Exception) {
                ErrorLog.record(context, "Pochette", e)
            }
        }
        if (home != null && home == lockScreen) {
            put(home, WallpaperTarget.BOTH)
        } else {
            home?.let { put(it, WallpaperTarget.HOME) }
            lockScreen?.let { put(it, WallpaperTarget.LOCK) }
        }
    }
}
