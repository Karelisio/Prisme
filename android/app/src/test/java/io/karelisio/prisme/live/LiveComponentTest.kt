package io.karelisio.prisme.live

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LiveComponentTest {
    @Test
    fun `la vidéo a son propre service, tous les autres genres passent par les scènes`() {
        assertEquals(LiveComponent.VIDEO, LiveComponent.forMode(LiveMode.VIDEO))
        for (mode in LiveMode.entries.filter { it != LiveMode.VIDEO }) {
            assertEquals("genre ${mode.key}", LiveComponent.SCENES, LiveComponent.forMode(mode))
        }
        // Le GIF est dessiné au canevas : c'est bien le service des scènes qui l'affiche.
        assertEquals(LiveComponent.SCENES, LiveComponent.forMode(LiveMode.GIF))
    }

    @Test
    fun `fond Prisme actif reconnu à son service`() {
        assertEquals(LiveComponent.SCENES, LiveComponent.ofService(ParallaxWallpaperService::class.java.name))
        assertEquals(LiveComponent.VIDEO, LiveComponent.ofService(VideoWallpaperService::class.java.name))
        // Fond d'écran d'une autre appli, ou aucun fond animé.
        assertNull(LiveComponent.ofService("com.exemple.AutreFond"))
        assertNull(LiveComponent.ofService(""))
        assertNull(LiveComponent.ofService(null))
    }

    @Test
    fun `clés envoyées à l'app`() {
        assertEquals("scenes", LiveComponent.SCENES.key)
        assertEquals("video", LiveComponent.VIDEO.key)
    }
}
