package io.karelisio.prisme.music

import android.media.session.PlaybackState
import io.karelisio.prisme.wallpaper.WallpaperTarget
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MusicRulesTest {
    @Test
    fun `clé de morceau, titre artiste et album`() {
        val key = MusicRules.trackKey("Intro", "Artiste", "Album")
        assertEquals(key, MusicRules.trackKey("Intro", "Artiste", "Album"))
        // Espaces autour ignorés.
        assertEquals(key, MusicRules.trackKey("  Intro ", "Artiste  ", " Album"))
        // Un champ qui change donne un autre morceau.
        assertNotEquals(key, MusicRules.trackKey("Outro", "Artiste", "Album"))
        assertNotEquals(key, MusicRules.trackKey("Intro", "Autre artiste", "Album"))
        assertNotEquals(key, MusicRules.trackKey("Intro", "Artiste", "Autre album"))
        assertNotEquals(key, MusicRules.trackKey("Intro", "Artiste", null))
    }

    @Test
    fun `clé de morceau sans collision entre champs voisins`() {
        assertNotEquals(MusicRules.trackKey("ab", "c", null), MusicRules.trackKey("a", "bc", null))
        assertNotEquals(MusicRules.trackKey("a", null, "b"), MusicRules.trackKey(null, "a", "b"))
    }

    @Test
    fun `clé de morceau absente quand le lecteur ne dit rien`() {
        assertNull(MusicRules.trackKey(null, null, null))
        assertNull(MusicRules.trackKey("", "  ", null))
        // Le titre seul suffit (webradio, podcast).
        assertEquals(MusicRules.trackKey("Station", null, null), MusicRules.trackKey("Station", "", ""))
        assertTrue(MusicRules.trackKey("Station", null, null) != null)
    }

    @Test
    fun `la pochette d'un nouveau morceau est posée pendant la lecture`() {
        assertTrue(MusicRules.shouldApply(enabled = true, playing = true, key = "b", lastKey = "a"))
        assertTrue(MusicRules.shouldApply(enabled = true, playing = true, key = "a", lastKey = null))
    }

    @Test
    fun `la même pochette n'est pas réappliquée`() {
        assertFalse(MusicRules.shouldApply(enabled = true, playing = true, key = "a", lastKey = "a"))
    }

    @Test
    fun `rien n'est appliqué option coupée, hors lecture ou sans clé`() {
        assertFalse(MusicRules.shouldApply(enabled = false, playing = true, key = "b", lastKey = "a"))
        assertFalse(MusicRules.shouldApply(enabled = true, playing = false, key = "b", lastKey = "a"))
        assertFalse(MusicRules.shouldApply(enabled = true, playing = true, key = null, lastKey = "a"))
        assertFalse(MusicRules.shouldApply(enabled = true, playing = true, key = null, lastKey = null))
    }

    @Test
    fun `lecture active, tampon et changement de piste compris`() {
        for (state in listOf(
            PlaybackState.STATE_PLAYING,
            PlaybackState.STATE_BUFFERING,
            PlaybackState.STATE_CONNECTING,
            PlaybackState.STATE_FAST_FORWARDING,
            PlaybackState.STATE_REWINDING,
            PlaybackState.STATE_SKIPPING_TO_NEXT,
            PlaybackState.STATE_SKIPPING_TO_PREVIOUS,
            PlaybackState.STATE_SKIPPING_TO_QUEUE_ITEM,
        )) {
            assertTrue("état $state", MusicRules.isActive(state))
        }
    }

    @Test
    fun `pause, arrêt, erreur ou absence d'état ne comptent pas comme lecture`() {
        for (state in listOf(PlaybackState.STATE_NONE, PlaybackState.STATE_STOPPED, PlaybackState.STATE_PAUSED, PlaybackState.STATE_ERROR, 99, -1)) {
            assertFalse("état $state", MusicRules.isActive(state))
        }
        assertFalse(MusicRules.isActive(null))
    }

    @Test
    fun `événements regroupés, mais une rafale sans fin ne retarde pas indéfiniment`() {
        // Début de rafale : on attend le délai habituel.
        assertEquals(1_500L, MusicRules.evaluationWait(MusicRules.EVENT_DELAY_MS, 0L))
        assertEquals(1_500L, MusicRules.evaluationWait(MusicRules.EVENT_DELAY_MS, 3_000L))
        // Proche de la limite : on n'attend que le temps qui reste.
        assertEquals(1_000L, MusicRules.evaluationWait(MusicRules.EVENT_DELAY_MS, 4_000L))
        // Limite atteinte ou dépassée : tout de suite.
        assertEquals(0L, MusicRules.evaluationWait(MusicRules.EVENT_DELAY_MS, MusicRules.BURST_MAX_MS))
        assertEquals(0L, MusicRules.evaluationWait(MusicRules.EVENT_DELAY_MS, 60_000L))
        // Un délai plus court (option activée dans l'app) reste tel quel.
        assertEquals(300L, MusicRules.evaluationWait(300L, 0L))
    }

    @Test
    fun `retour au fond précédent une minute après l'arrêt`() {
        val stoppedAt = 1_000_000L
        assertEquals(60_000L, MusicRules.restoreDelay(stoppedAt, stoppedAt))
        assertEquals(50_000L, MusicRules.restoreDelay(stoppedAt, stoppedAt + 10_000))
        assertEquals(0L, MusicRules.restoreDelay(stoppedAt, stoppedAt + 60_000))
        // Dépassé (processus relancé tard) : tout de suite.
        assertEquals(0L, MusicRules.restoreDelay(stoppedAt, stoppedAt + 3_600_000))
        // Horloge reculée : jamais plus que le délai complet.
        assertEquals(60_000L, MusicRules.restoreDelay(stoppedAt, stoppedAt - 5_000))
    }

    @Test
    fun `écrans touchés, l'union de ce qui a été posé`() {
        assertEquals(WallpaperTarget.LOCK, MusicRules.touched(null, WallpaperTarget.LOCK))
        assertEquals(WallpaperTarget.HOME, MusicRules.touched(WallpaperTarget.HOME, WallpaperTarget.HOME))
        // L'écran visé a changé pendant l'affichage : les deux ont reçu une pochette.
        assertEquals(WallpaperTarget.BOTH, MusicRules.touched(WallpaperTarget.HOME, WallpaperTarget.LOCK))
        assertEquals(WallpaperTarget.BOTH, MusicRules.touched(WallpaperTarget.BOTH, WallpaperTarget.HOME))
        assertEquals(WallpaperTarget.BOTH, MusicRules.touched(WallpaperTarget.LOCK, WallpaperTarget.BOTH))
    }
}
