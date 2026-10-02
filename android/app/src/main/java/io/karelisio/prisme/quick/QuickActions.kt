package io.karelisio.prisme.quick

import android.app.Activity
import android.content.Context
import android.os.Bundle
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf

/** Lancement des actions rapides : un seul changement à la fois, les appuis répétés sont ignorés. */
object QuickActions {
    const val ACTION_NEXT = "io.karelisio.prisme.action.NEXT"
    const val ACTION_FAVORITE = "io.karelisio.prisme.action.FAVORITE"
    const val MODE_NEXT = "next"
    const val MODE_FAVORITE = "favorite"
    private const val UNIQUE = "prisme-quick"

    fun enqueue(context: Context, mode: String) {
        val request = OneTimeWorkRequestBuilder<QuickNextWorker>()
            .setInputData(workDataOf(QuickNextWorker.KEY_MODE to mode))
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(UNIQUE, ExistingWorkPolicy.KEEP, request)
    }
}

/** Tuile des Réglages rapides « Fond suivant ». */
class NextWallpaperTileService : TileService() {
    override fun onStartListening() {
        super.onStartListening()
        qsTile?.apply {
            state = Tile.STATE_INACTIVE
            if (android.os.Build.VERSION.SDK_INT >= 29) subtitle = "Prisme"
            updateTile()
        }
    }

    override fun onClick() {
        super.onClick()
        QuickActions.enqueue(applicationContext, QuickActions.MODE_NEXT)
    }
}

/** Cible invisible des raccourcis de l'icône : lance l'action puis se ferme aussitôt. */
class QuickActionActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        when (intent?.action) {
            QuickActions.ACTION_NEXT -> QuickActions.enqueue(applicationContext, QuickActions.MODE_NEXT)
            QuickActions.ACTION_FAVORITE -> QuickActions.enqueue(applicationContext, QuickActions.MODE_FAVORITE)
        }
        finish()
    }
}
