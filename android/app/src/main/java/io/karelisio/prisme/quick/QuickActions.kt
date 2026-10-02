package io.karelisio.prisme.quick

import android.app.Activity
import android.content.Context
import android.os.Build
import android.os.Bundle
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import io.karelisio.prisme.R
import io.karelisio.prisme.system.ErrorLog
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.concurrent.atomic.AtomicBoolean

/**
 * « Fond suivant » et « Favori au hasard » : exécutés tout de suite dans le processus de l'app
 * (pas de file d'attente que le système pourrait différer), un seul changement à la fois.
 */
object QuickActions {
    const val ACTION_NEXT = "io.karelisio.prisme.action.NEXT"
    const val ACTION_FAVORITE = "io.karelisio.prisme.action.FAVORITE"
    const val MODE_NEXT = "next"
    const val MODE_FAVORITE = "favorite"

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val busy = AtomicBoolean(false)

    val running: Boolean
        get() = busy.get()

    /** Lance le changement ; false s'il y en a déjà un en cours. [onDone] est appelé sur le fil principal. */
    internal fun start(context: Context, mode: String, onDone: (QuickChanger.Outcome) -> Unit = {}): Boolean {
        if (!busy.compareAndSet(false, true)) return false
        val app = context.applicationContext
        scope.launch {
            val outcome = try {
                QuickChanger(app).run(mode)
            } catch (e: Exception) {
                // Gardé dans le journal (Réglages › Diagnostic) pour comprendre un échec.
                ErrorLog.record(app, "Fond suivant", e)
                QuickChanger.Outcome.Failed(e.message ?: e.javaClass.simpleName)
            } finally {
                busy.set(false)
            }
            withContext(Dispatchers.Main) {
                QuickChanger.toast(app, outcome)
                onDone(outcome)
            }
        }
        return true
    }
}

/** Tuile des Réglages rapides « Fond suivant » : son sous-titre indique ce qui se passe. */
class NextWallpaperTileService : TileService() {
    override fun onStartListening() {
        super.onStartListening()
        show(if (QuickActions.running) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE, lastLabel ?: getString(R.string.app_name))
    }

    override fun onClick() {
        super.onClick()
        val started = QuickActions.start(this, QuickActions.MODE_NEXT) { outcome ->
            lastLabel = QuickChanger.tileLabel(this, outcome)
            show(Tile.STATE_INACTIVE, lastLabel ?: "")
        }
        if (started) show(Tile.STATE_ACTIVE, getString(R.string.tile_working))
    }

    private fun show(state: Int, subtitle: String) {
        val tile = qsTile ?: return
        tile.state = state
        if (Build.VERSION.SDK_INT >= 29) tile.subtitle = subtitle
        tile.updateTile()
    }

    private companion object {
        var lastLabel: String? = null
    }
}

/** Cible invisible des raccourcis de l'icône : lance le changement puis se ferme aussitôt. */
class QuickActionActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        when (intent?.action) {
            QuickActions.ACTION_NEXT -> QuickActions.start(this, QuickActions.MODE_NEXT)
            QuickActions.ACTION_FAVORITE -> QuickActions.start(this, QuickActions.MODE_FAVORITE)
        }
        finish()
    }
}
