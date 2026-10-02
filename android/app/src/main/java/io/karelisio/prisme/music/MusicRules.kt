package io.karelisio.prisme.music

import android.media.session.PlaybackState
import io.karelisio.prisme.wallpaper.WallpaperTarget

/** Décisions de la pochette (pures, testées sur JVM) : clé de morceau, quand appliquer, quand rendre le fond. */
internal object MusicRules {
    /** Un changement de morceau déclenche une rafale d'événements (métadonnées, état, pochette) : on attend qu'elle cesse. */
    const val EVENT_DELAY_MS = 1_500L

    /** Une rafale sans fin (lecteur qui publie sa position chaque seconde) ne retarde pas la relecture au-delà de cette durée. */
    const val BURST_MAX_MS = 5_000L

    /** Durée de pause ou d'arrêt avant de rendre le fond précédent. */
    const val RESTORE_DELAY_MS = 60_000L

    private const val SEPARATOR = "\u001F"

    /** Titre + artiste + album : identifie le morceau pour ne pas réappliquer la même pochette. Null si le lecteur n'en dit rien. */
    fun trackKey(title: CharSequence?, artist: CharSequence?, album: CharSequence?): String? {
        val parts = listOf(title, artist, album).map { it?.toString()?.trim().orEmpty() }
        return if (parts.all { it.isEmpty() }) null else parts.joinToString(SEPARATOR)
    }

    /** Attente avant de relire l'état : [delayMs] après le dernier événement, mais pas plus de [BURST_MAX_MS] depuis le premier de la rafale. */
    fun evaluationWait(delayMs: Long, burstElapsedMs: Long): Long = delayMs.coerceAtMost(BURST_MAX_MS - burstElapsedMs).coerceAtLeast(0L)

    /** Lecture en cours ou sur le point de l'être (tampon, changement de piste) ; pause, arrêt ou erreur : non. */
    fun isActive(state: Int?): Boolean = when (state) {
        PlaybackState.STATE_PLAYING,
        PlaybackState.STATE_BUFFERING,
        PlaybackState.STATE_CONNECTING,
        PlaybackState.STATE_FAST_FORWARDING,
        PlaybackState.STATE_REWINDING,
        PlaybackState.STATE_SKIPPING_TO_NEXT,
        PlaybackState.STATE_SKIPPING_TO_PREVIOUS,
        PlaybackState.STATE_SKIPPING_TO_QUEUE_ITEM,
        -> true
        else -> false
    }

    /** Faut-il poser la pochette du morceau [key] ? Pas si c'est celle qui est déjà affichée. */
    fun shouldApply(enabled: Boolean, playing: Boolean, key: String?, lastKey: String?): Boolean =
        enabled && playing && key != null && key != lastKey

    /** Attente restante avant le retour au fond précédent, [pausedSince] étant l'heure où la lecture s'est arrêtée. */
    fun restoreDelay(pausedSince: Long, now: Long): Long = (RESTORE_DELAY_MS - (now - pausedSince)).coerceIn(0L, RESTORE_DELAY_MS)

    /** Écrans touchés depuis le début de l'affichage : si l'écran visé a changé entre-temps, ce sont les deux. */
    fun touched(previous: WallpaperTarget?, target: WallpaperTarget): WallpaperTarget =
        if (previous == null || previous == target) target else WallpaperTarget.BOTH
}
