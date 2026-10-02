package io.karelisio.prisme.automation

import android.content.Context

/**
 * Automatismes prioritaires du moment, dans l'ordre de priorité : fête du jour, puis lieu. Chaque
 * règle renvoie son fond (ou null) ; le moteur applique le premier.
 */
internal object Overrides {
    // Le moteur n'applique que le premier : une règle n'est évaluée que si les précédentes ne donnent rien
    // (pas de recherche de position un jour de fête).
    fun compute(context: Context, config: AutomationConfig, moment: Moment): List<Override> =
        listOfNotNull(EventsRule.pick(context, config.events, moment) ?: PlacesRule.compute(context, config, moment))
}
