package io.karelisio.prisme.widget

import io.karelisio.prisme.quick.QuickChanger.Outcome
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WidgetStateTest {
    private val failed = Outcome.Failed("connexion ?")

    @Test
    fun `au repos, le bouton propose le fond suivant`() {
        assertEquals(WidgetButton.Idle, WidgetState().button)
    }

    @Test
    fun `pendant le changement, le bouton annonce le changement`() {
        val state = WidgetState()
        state.begin()
        assertEquals(WidgetButton.Changing, state.button)
    }

    @Test
    fun `fond posé, le bouton redevient normal et l'aperçu fait foi`() {
        val state = WidgetState()
        state.begin()
        assertNull(state.finish(Outcome.Applied))
        assertEquals(WidgetButton.Idle, state.button)
    }

    @Test
    fun `toute autre issue est annoncée`() {
        for (outcome in listOf(Outcome.Empty, Outcome.Music, failed)) {
            val state = WidgetState()
            state.begin()
            assertNotNull(state.finish(outcome))
            assertEquals(WidgetButton.Result(outcome), state.button)
        }
    }

    @Test
    fun `le libellé d'issue s'efface avec son jeton, une seule fois`() {
        val state = WidgetState()
        state.begin()
        val token = state.finish(Outcome.Empty)!!
        assertTrue(state.expire(token))
        assertEquals(WidgetButton.Idle, state.button)
        assertFalse(state.expire(token))
    }

    @Test
    fun `le jeton d'un ancien libellé n'efface ni un changement en cours ni un libellé plus récent`() {
        val state = WidgetState()
        state.begin()
        val old = state.finish(failed)!!

        // Nouveau changement : le bouton annonce « Changement… », l'ancien jeton ne le touche pas.
        state.begin()
        assertFalse(state.expire(old))
        assertEquals(WidgetButton.Changing, state.button)

        // Même issue qu'avant : c'est un nouveau libellé, avec son propre jeton.
        val newer = state.finish(failed)!!
        assertFalse(state.expire(old))
        assertEquals(WidgetButton.Result(failed), state.button)
        assertTrue(state.expire(newer))
        assertEquals(WidgetButton.Idle, state.button)
    }

    @Test
    fun `fond posé pendant l'affichage d'un libellé, le jeton devient sans effet`() {
        val state = WidgetState()
        state.begin()
        val token = state.finish(Outcome.Music)!!
        // Un autre changement (tuile, rotation) pose un fond : l'état revient au repos par ses propres moyens.
        state.begin()
        state.finish(Outcome.Applied)
        assertFalse(state.expire(token))
        assertEquals(WidgetButton.Idle, state.button)
    }
}
