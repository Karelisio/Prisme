package io.karelisio.prisme.live

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.PowerManager
import androidx.core.content.ContextCompat

/**
 * Surveille l'économie d'énergie et la batterie pour figer le fond animé (voir [EcoRules]). [onChange]
 * est appelé, sur le fil principal, quand [lowPower] change.
 */
internal class EcoMonitor(private val context: Context, private val onChange: () -> Unit) {
    private val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    private var batteryPercent: Int? = null
    private var charging = false
    private var registered = false

    /** Économie d'énergie active, ou batterie faible hors charge. */
    var lowPower = false
        private set

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action == Intent.ACTION_BATTERY_CHANGED) readBattery(intent)
            update()
        }
    }

    fun start() {
        if (registered) return
        val filter = IntentFilter().apply {
            addAction(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED)
            addAction(Intent.ACTION_BATTERY_CHANGED)
        }
        // Diffusions du système uniquement : aucune autre appli ne peut atteindre ce récepteur.
        val sticky = runCatching { ContextCompat.registerReceiver(context, receiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED) }
        registered = sticky.isSuccess
        sticky.getOrNull()?.let(::readBattery)
        update()
    }

    fun stop() {
        if (registered) runCatching { context.unregisterReceiver(receiver) }
        registered = false
    }

    private fun readBattery(intent: Intent) {
        batteryPercent = percent(intent)
        charging = charging(intent)
    }

    private fun update() {
        val low = EcoRules.paused(true, power.isPowerSaveMode, batteryPercent, charging)
        if (low == lowPower) return
        lowPower = low
        onChange()
    }

    companion object {
        /** État du moment, sans surveiller (pour l'app) : économie d'énergie, ou batterie faible hors charge. */
        fun isLowPower(context: Context): Boolean {
            val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
            // Diffusion « collante » : lue sans enregistrer de récepteur.
            val battery = runCatching {
                ContextCompat.registerReceiver(context, null, IntentFilter(Intent.ACTION_BATTERY_CHANGED), ContextCompat.RECEIVER_NOT_EXPORTED)
            }.getOrNull()
            return EcoRules.paused(true, power.isPowerSaveMode, battery?.let(::percent), battery?.let(::charging) == true)
        }

        private fun percent(intent: Intent): Int? {
            val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
            val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
            return if (level >= 0 && scale > 0) level * 100 / scale else null
        }

        private fun charging(intent: Intent): Boolean {
            val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
            return status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL
        }
    }
}
