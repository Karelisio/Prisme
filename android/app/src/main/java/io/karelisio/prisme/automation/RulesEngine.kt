package io.karelisio.prisme.automation

import io.karelisio.prisme.wallpaper.WallpaperRef
import io.karelisio.prisme.wallpaper.WallpaperTarget
import kotlin.random.Random

/** Instant figé, découpé comme le moteur en a besoin (jour 1 = lundi). */
data class Moment(val epochMillis: Long, val dayOfWeek: Int, val minuteOfDay: Int, val month: Int)

data class Environment(
    val moment: Moment,
    val batteryLevel: Int? = null,
    val charging: Boolean = false,
    val weather: WeatherCondition? = null,
)

/** État persistant entre deux exécutions. */
data class AutomationState(
    val rotationIndex: Int = -1,
    val lastRotationAt: Long = 0,
    val appliedHome: String? = null,
    val appliedLock: String? = null,
    val focusApplied: Boolean = false,
    val dynamicApplied: Boolean = false,
    /** Dernière évaluation des automatismes (affichée dans Diagnostic). */
    val lastRunAt: Long = 0,
)

/** Résultat d'un fond dynamique : un fond, rien à changer (donnée inconnue), ou aucun fond prévu. */
sealed interface DynamicChoice {
    data class Pick(val ref: WallpaperRef) : DynamicChoice
    data object Keep : DynamicChoice
    data object Unset : DynamicChoice
}

enum class Reason { FOCUS, DYNAMIC, ROTATION, RESTORE, NONE }

/** Fonds voulus par écran (null = ne rien changer). */
data class Decision(val home: WallpaperRef?, val lock: WallpaperRef?, val reason: Reason, val state: AutomationState)

/**
 * Logique pure, testée sur JVM. Priorités : mode focus > fonds dynamiques > rotation.
 * Quand le focus se termine, ou qu'aucun fond dynamique n'est prévu pour la situation, et qu'aucun
 * autre automatisme ne prend le relais, on restaure le dernier fond choisi à la main.
 */
object RulesEngine {
    private const val MINUTES_PER_DAY = 24 * 60

    fun decide(
        config: AutomationConfig,
        env: Environment,
        state: AutomationState,
        lastManual: (WallpaperTarget) -> WallpaperRef?,
        random: Random = Random.Default,
    ): Decision {
        val focus = config.focus
        if (focusActive(focus, env.moment)) {
            val ref = focus.ref!!
            return decision(ref, focus.target, Reason.FOCUS, state.copy(focusApplied = true))
        }

        val dynamic = config.dynamic
        if (dynamic.enabled) {
            when (val choice = dynamicChoice(dynamic.mode, env)) {
                is DynamicChoice.Pick ->
                    return decision(choice.ref, dynamic.target, Reason.DYNAMIC, state.copy(focusApplied = false, dynamicApplied = true))
                // Météo ou batterie inconnue (réseau absent…) : on ne touche à rien.
                DynamicChoice.Keep -> if (!state.focusApplied) return Decision(null, null, Reason.NONE, state)
                DynamicChoice.Unset -> Unit
            }
        }

        val rotation = config.rotation
        if (rotation.enabled && rotation.items.isNotEmpty()) {
            var next = state
            val intervalMillis = rotation.intervalMinutes * 60_000L
            val due = state.rotationIndex !in rotation.items.indices || env.moment.epochMillis - state.lastRotationAt >= intervalMillis
            if (due) {
                next = next.copy(
                    rotationIndex = nextRotationIndex(state.rotationIndex, rotation.items.size, rotation.shuffle, random),
                    lastRotationAt = env.moment.epochMillis,
                )
            }
            return decision(rotation.items[next.rotationIndex], rotation.target, Reason.ROTATION, next.copy(focusApplied = false, dynamicApplied = false))
        }

        if (state.focusApplied || state.dynamicApplied) {
            val targets = listOfNotNull(focus.target.takeIf { state.focusApplied }, dynamic.target.takeIf { state.dynamicApplied })
            val home = targets.any { it != WallpaperTarget.LOCK }
            val lock = targets.any { it != WallpaperTarget.HOME }
            return Decision(
                home = if (home) lastManual(WallpaperTarget.HOME) else null,
                lock = if (lock) lastManual(WallpaperTarget.LOCK) else null,
                reason = Reason.RESTORE,
                state = state.copy(focusApplied = false, dynamicApplied = false),
            )
        }
        return Decision(null, null, Reason.NONE, state)
    }

    private fun decision(ref: WallpaperRef, target: WallpaperTarget, reason: Reason, state: AutomationState) = Decision(
        home = ref.takeIf { target != WallpaperTarget.LOCK },
        lock = ref.takeIf { target != WallpaperTarget.HOME },
        reason = reason,
        state = state,
    )

    fun focusActive(focus: FocusConfig, moment: Moment): Boolean =
        focus.enabled && focus.ref != null && focus.schedules.any { inSchedule(it, moment) }

    fun inSchedule(schedule: FocusSchedule, m: Moment): Boolean {
        val (start, end) = schedule.startMinute to schedule.endMinute
        if (start == end) return false
        if (start < end) return m.dayOfWeek in schedule.days && m.minuteOfDay in start until end
        // Plage de nuit : commence le jour indiqué, se termine le lendemain.
        return (m.dayOfWeek in schedule.days && m.minuteOfDay >= start) ||
            (previousDay(m.dayOfWeek) in schedule.days && m.minuteOfDay < end)
    }

    fun previousDay(day: Int): Int = if (day == 1) 7 else day - 1

    fun dynamicChoice(mode: DynamicMode?, env: Environment): DynamicChoice {
        fun of(ref: WallpaperRef?) = ref?.let { DynamicChoice.Pick(it) } ?: DynamicChoice.Unset
        return when (mode) {
            is DynamicMode.Time -> of(timeSlotRef(mode.slots, env.moment.minuteOfDay))
            is DynamicMode.Seasons -> of(mode.items[season(env.moment.month, mode.southern)])
            is DynamicMode.Battery ->
                if (env.batteryLevel == null && !env.charging) DynamicChoice.Keep else of(batteryRef(mode, env.batteryLevel, env.charging))
            is DynamicMode.Weather -> env.weather?.let { of(weatherRef(mode.items, it)) } ?: DynamicChoice.Keep
            null -> DynamicChoice.Unset
        }
    }

    /** Créneau en cours : le dernier commencé, sinon celui de la veille au soir. */
    fun timeSlotRef(slots: List<TimeSlot>, minute: Int): WallpaperRef? {
        if (slots.isEmpty()) return null
        val sorted = slots.sortedBy { it.startMinute }
        return (sorted.lastOrNull { it.startMinute <= minute } ?: sorted.last()).ref
    }

    /** Saisons météorologiques (mars-mai = printemps dans l'hémisphère nord). */
    fun season(month: Int, southern: Boolean): Season {
        val north = when (month) {
            3, 4, 5 -> Season.SPRING
            6, 7, 8 -> Season.SUMMER
            9, 10, 11 -> Season.AUTUMN
            else -> Season.WINTER
        }
        if (!southern) return north
        return when (north) {
            Season.SPRING -> Season.AUTUMN
            Season.SUMMER -> Season.WINTER
            Season.AUTUMN -> Season.SPRING
            Season.WINTER -> Season.SUMMER
        }
    }

    /** Fond de la plage où se trouve le niveau ; null si cette plage n'a pas de fond. */
    fun batteryRef(mode: DynamicMode.Battery, level: Int?, charging: Boolean): WallpaperRef? {
        if (charging && mode.charging != null) return mode.charging
        if (level == null) return null
        return mode.levels.firstOrNull { level >= it.min && level < it.max }?.ref
    }

    /** Codes météo WMO (Open-Meteo) → condition affichable. */
    fun weatherFromCode(code: Int, isDay: Boolean): WeatherCondition {
        val condition = when (code) {
            0, 1 -> WeatherCondition.CLEAR
            2, 3 -> WeatherCondition.CLOUDY
            45, 48 -> WeatherCondition.FOG
            in 51..67, in 80..82 -> WeatherCondition.RAIN
            in 71..77, 85, 86 -> WeatherCondition.SNOW
            in 95..99 -> WeatherCondition.STORM
            else -> WeatherCondition.CLOUDY
        }
        return if (!isDay && condition == WeatherCondition.CLEAR) WeatherCondition.NIGHT else condition
    }

    /** Condition exacte, sinon la plus proche disponible. */
    fun weatherRef(items: Map<WeatherCondition, WallpaperRef>, condition: WeatherCondition): WallpaperRef? {
        val fallbacks = when (condition) {
            WeatherCondition.NIGHT -> listOf(WeatherCondition.CLEAR)
            WeatherCondition.FOG -> listOf(WeatherCondition.CLOUDY)
            WeatherCondition.STORM -> listOf(WeatherCondition.RAIN, WeatherCondition.CLOUDY)
            WeatherCondition.SNOW -> listOf(WeatherCondition.CLOUDY)
            WeatherCondition.RAIN -> listOf(WeatherCondition.CLOUDY)
            WeatherCondition.CLOUDY -> listOf(WeatherCondition.CLEAR)
            WeatherCondition.CLEAR -> listOf(WeatherCondition.CLOUDY)
        }
        return (listOf(condition) + fallbacks).firstNotNullOfOrNull { items[it] }
    }

    fun nextRotationIndex(current: Int, size: Int, shuffle: Boolean, random: Random): Int {
        if (size <= 1) return 0
        if (!shuffle) return if (current in 0 until size) (current + 1) % size else 0
        // Aléatoire, mais jamais deux fois de suite le même fond.
        val pick = random.nextInt(size - 1)
        return if (current in 0 until size && pick >= current) pick + 1 else pick
    }

    /**
     * Minutes avant le prochain changement prévisible (début/fin de focus, créneau horaire,
     * rotation) pour planifier une exécution précise ; null s'il n'y en a pas.
     */
    fun minutesUntilNextChange(config: AutomationConfig, state: AutomationState, m: Moment): Int? {
        val candidates = mutableListOf<Int>()
        if (config.focus.enabled && config.focus.ref != null) {
            for (schedule in config.focus.schedules) {
                untilWeekly(schedule.days, schedule.startMinute, m)?.let(candidates::add)
                val endDays = if (schedule.endMinute <= schedule.startMinute) schedule.days.map { it % 7 + 1 }.toSet() else schedule.days
                untilWeekly(endDays, schedule.endMinute, m)?.let(candidates::add)
            }
        }
        val mode = config.dynamic.mode
        if (config.dynamic.enabled && mode is DynamicMode.Time) {
            for (slot in mode.slots) candidates += untilDaily(slot.startMinute, m.minuteOfDay)
        }
        if (config.rotation.enabled && config.rotation.items.size > 1 && state.lastRotationAt > 0) {
            val dueAt = state.lastRotationAt + config.rotation.intervalMinutes * 60_000L
            candidates += ((dueAt - m.epochMillis) / 60_000L).toInt().coerceAtLeast(1)
        }
        return candidates.filter { it > 0 }.minOrNull()
    }

    private fun untilDaily(target: Int, minute: Int): Int {
        val diff = target - minute
        return if (diff > 0) diff else diff + MINUTES_PER_DAY
    }

    private fun untilWeekly(days: Set<Int>, target: Int, m: Moment): Int? {
        var best: Int? = null
        for (offset in 0..7) {
            val day = (m.dayOfWeek - 1 + offset) % 7 + 1
            if (day !in days) continue
            val minutes = offset * MINUTES_PER_DAY + target - m.minuteOfDay
            if (minutes > 0 && (best == null || minutes < best)) best = minutes
        }
        return best
    }
}
