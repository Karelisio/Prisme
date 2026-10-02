package io.karelisio.prisme.automation

import android.content.Context

/**
 * Automatismes prioritaires du moment, dans l'ordre de priorité : fête du jour, puis lieu. Chaque
 * règle renvoie son fond (ou null) ; le moteur applique le premier.
 */
internal object Overrides {
    fun compute(context: Context, config: AutomationConfig, moment: Moment): List<Override> = listOfNotNull(
        EventsRule.pick(context, config.events, moment),
    )
}
