package io.karelisio.prisme.widget

import io.karelisio.prisme.quick.QuickChanger

/** Ce que le bouton du widget annonce. */
internal sealed interface WidgetButton {
    /** « Fond suivant » : rien en cours. */
    data object Idle : WidgetButton

    /** « Changement… » : un changement lancé depuis le widget est en cours. */
    data object Changing : WidgetButton

    /** Court libellé de l'issue d'un changement qui n'a pas posé de nouveau fond (aucun favori, échec…). */
    data class Result(val outcome: QuickChanger.Outcome) : WidgetButton
}

/**
 * État du bouton des widgets posés : « Changement… » le temps du changement, puis le nouvel aperçu
 * (fond posé) ou un court libellé d'issue qui s'efface ensuite. Les rappels arrivent de fils
 * différents : chaque transition est atomique.
 */
internal class WidgetState {
    @Volatile
    var button: WidgetButton = WidgetButton.Idle
        private set

    private var version = 0

    /** Un changement démarre. */
    @Synchronized
    fun begin() {
        button = WidgetButton.Changing
        version++
    }

    /**
     * Le changement est terminé. Un fond posé n'a pas besoin de libellé (l'aperçu a changé) : le bouton
     * redevient « Fond suivant » et on renvoie null. Les autres issues s'affichent un moment : on renvoie
     * alors le jeton à passer à [expire] une fois ce moment écoulé.
     */
    @Synchronized
    fun finish(outcome: QuickChanger.Outcome): Int? {
        version++
        if (outcome == QuickChanger.Outcome.Applied) {
            button = WidgetButton.Idle
            return null
        }
        button = WidgetButton.Result(outcome)
        return version
    }

    /** Efface le libellé d'issue du jeton [token] ; faux si un autre changement est passé par là entre-temps. */
    @Synchronized
    fun expire(token: Int): Boolean {
        if (token != version || button !is WidgetButton.Result) return false
        button = WidgetButton.Idle
        version++
        return true
    }
}
