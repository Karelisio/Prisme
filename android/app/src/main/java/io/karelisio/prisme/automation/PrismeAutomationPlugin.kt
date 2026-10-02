package io.karelisio.prisme.automation

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import io.karelisio.prisme.quick.QuickPool
import io.karelisio.prisme.wallpaper.CurrentWallpapers
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

/** Pont des automatismes : configuration, état, journal et position approximative (météo). */
@CapacitorPlugin(
    name = "PrismeAutomation",
    permissions = [Permission(alias = "location", strings = [Manifest.permission.ACCESS_COARSE_LOCATION])],
)
class PrismeAutomationPlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val mainHandler = Handler(Looper.getMainLooper())

    override fun handleOnDestroy() {
        mainHandler.removeCallbacksAndMessages(null)
        scope.cancel()
        super.handleOnDestroy()
    }

    @PluginMethod
    fun configure(call: PluginCall) {
        val json = call.getObject("config")
        if (json == null) {
            call.reject("Configuration manquante", "INVALID_ARGUMENT")
            return
        }
        val config = AutomationConfig.fromJson(json)
        scope.launch {
            val force = withContext(Dispatchers.IO) {
                val store = AutomationStore(context)
                val previous = store.config()
                store.saveConfig(json.toString())
                // Nouveau thème de rotation en ligne (ou fin de celle-ci) : un nouveau fond tout de suite.
                if (previous.rotation.online?.key != config.rotation.online?.key) {
                    store.saveState(store.state().copy(onlineRef = null, lastRotationAt = 0))
                    OnlineQueue(context).clear()
                }
                AutomationFiles(context).cleanup(config, AutomationRunner.keptOnline(context, store.state()))
                // « Assombrir le soir » coupé : les fonds retrouvent tout de suite leur luminosité.
                if (previous.dim.enabled && !config.dim.enabled) {
                    runCatching { CurrentWallpapers(context).refreshDim(0f) }
                    CurrentWallpapers(context).clear()
                }
                // Activation, changement de mode ou d'écran : on réapplique tout de suite.
                previous.signature() != config.signature()
            }
            AutomationScheduler.configure(context, config, force)
            call.resolve(JSObject().put("enabled", config.anyEnabled))
        }
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        scope.launch {
            val status = withContext(Dispatchers.IO) {
                val store = AutomationStore(context)
                val config = store.config()
                val state = store.state()
                JSObject()
                    .put("enabled", config.anyEnabled)
                    .put("focusActive", RulesEngine.focusActive(config.focus, AutomationStore.now()))
                    .put("appliedHome", state.appliedHome)
                    .put("appliedLock", state.appliedLock)
                    .put("lastRotationAt", state.lastRotationAt)
                    .put("lastRunAt", state.lastRunAt)
                    .put("quickPoolSize", QuickPool(context).load().items.size)
            }
            call.resolve(status)
        }
    }

    /** Fonds appliqués automatiquement depuis le dernier appel (puis effacés). */
    @PluginMethod
    fun drainLog(call: PluginCall) {
        scope.launch {
            val log = withContext(Dispatchers.IO) { AutomationStore(context).drainLog() }
            val entries = JSArray()
            for (i in 0 until log.length()) (log.opt(i) as? JSONObject)?.let { entries.put(it) }
            call.resolve(JSObject().put("entries", entries))
        }
    }

    @PluginMethod
    fun runNow(call: PluginCall) {
        AutomationScheduler.runNow(context, prefetch = true, force = true)
        call.resolve()
    }

    /** Passe au fond suivant de la rotation sans attendre la fin de l'intervalle. */
    @PluginMethod
    fun nextRotation(call: PluginCall) {
        scope.launch {
            withContext(Dispatchers.IO) {
                val store = AutomationStore(context)
                store.saveState(store.state().copy(lastRotationAt = 0))
            }
            AutomationScheduler.runNow(context)
            call.resolve()
        }
    }

    /** Favoris disponibles pour la tuile et les raccourcis « Fond suivant » / « Favori au hasard ». */
    @PluginMethod
    fun setQuickPool(call: PluginCall) {
        val pool = call.data
        scope.launch {
            withContext(Dispatchers.IO) { QuickPool(context).save(pool.toString()) }
            call.resolve()
        }
    }

    /** Choix d'un dossier du téléphone pour la rotation (accès en lecture conservé). */
    @PluginMethod
    fun pickFolder(call: PluginCall) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        startActivityForResult(call, intent, "onFolderResult")
    }

    @ActivityCallback
    private fun onFolderResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val uri = result.data?.data
        if (result.resultCode != Activity.RESULT_OK || uri == null) {
            call.resolve(JSObject().put("cancelled", true))
            return
        }
        try {
            context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
        } catch (e: SecurityException) {
            call.reject("Accès au dossier refusé", "PERMISSION_DENIED", e)
            return
        }
        scope.launch {
            val info = withContext(Dispatchers.IO) { FolderSource.info(context, uri.toString()) }
            call.resolve(JSObject().put("cancelled", false).put("uri", uri.toString()).put("name", info.name).put("count", info.count))
        }
    }

    @PluginMethod
    fun getFolderInfo(call: PluginCall) {
        val uri = call.getString("uri")
        if (uri.isNullOrBlank()) {
            call.reject("Dossier manquant", "INVALID_ARGUMENT")
            return
        }
        scope.launch {
            val result = withContext(Dispatchers.IO) {
                if (!FolderSource.accessible(context, uri)) JSObject().put("accessible", false).put("name", "").put("count", 0)
                else FolderSource.info(context, uri).let { JSObject().put("accessible", true).put("name", it.name).put("count", it.count) }
            }
            call.resolve(result)
        }
    }

    @PluginMethod
    fun getApproximateLocation(call: PluginCall) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "onLocationPermission")
            return
        }
        locate(call)
    }

    @PermissionCallback
    private fun onLocationPermission(call: PluginCall) {
        if (getPermissionState("location") == PermissionState.GRANTED) locate(call)
        else call.reject("Autorisation de localisation refusée", "PERMISSION_DENIED")
    }

    @SuppressLint("MissingPermission")
    private fun locate(call: PluginCall) {
        val manager = context.getSystemService(LocationManager::class.java)
        if (manager == null) {
            call.reject("Localisation indisponible", "UNAVAILABLE")
            return
        }
        try {
            val recent = manager.getProviders(true)
                .mapNotNull { manager.getLastKnownLocation(it) }
                .filter { System.currentTimeMillis() - it.time < MAX_LOCATION_AGE_MS }
                .maxByOrNull { it.time }
            if (recent != null) {
                resolveLocation(call, recent)
                return
            }
            val provider = when {
                manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
                manager.isProviderEnabled(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
                else -> null
            }
            if (provider == null) {
                call.reject("Active la localisation de l'appareil", "UNAVAILABLE")
                return
            }
            var done = false
            val finish = { location: Location? ->
                if (!done) {
                    done = true
                    if (location != null) resolveLocation(call, location) else call.reject("Position introuvable", "UNAVAILABLE")
                }
            }
            if (Build.VERSION.SDK_INT >= 30) {
                manager.getCurrentLocation(provider, null, context.mainExecutor) { finish(it) }
            } else {
                val listener = object : LocationListener {
                    override fun onLocationChanged(location: Location) {
                        manager.removeUpdates(this)
                        finish(location)
                    }
                }
                @Suppress("DEPRECATION")
                manager.requestSingleUpdate(provider, listener, Looper.getMainLooper())
                mainHandler.postDelayed({
                    manager.removeUpdates(listener)
                    finish(null)
                }, LOCATION_TIMEOUT_MS)
            }
            mainHandler.postDelayed({ finish(null) }, LOCATION_TIMEOUT_MS)
        } catch (e: SecurityException) {
            call.reject("Autorisation de localisation refusée", "PERMISSION_DENIED")
        }
    }

    private fun resolveLocation(call: PluginCall, location: Location) {
        call.resolve(JSObject().put("latitude", location.latitude).put("longitude", location.longitude))
    }

    private companion object {
        const val MAX_LOCATION_AGE_MS = 6 * 60 * 60_000L
        const val LOCATION_TIMEOUT_MS = 15_000L
    }
}
