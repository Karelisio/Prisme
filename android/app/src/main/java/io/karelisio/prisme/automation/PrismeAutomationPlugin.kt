package io.karelisio.prisme.automation

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
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

/** Pont des automatismes : configuration, état, journal, position approximative (météo) et position précise (lieux). */
@CapacitorPlugin(
    name = "PrismeAutomation",
    permissions = [
        Permission(alias = "location", strings = [Manifest.permission.ACCESS_COARSE_LOCATION]),
        // Depuis Android 12, la position précise se demande avec l'approximative, en une seule fois.
        Permission(alias = "preciseLocation", strings = [Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION]),
        Permission(alias = "backgroundLocation", strings = ["android.permission.ACCESS_BACKGROUND_LOCATION"]),
    ],
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

    /** Position précise (ajout d'un lieu) : demande l'autorisation au besoin, échoue au bout d'environ 20 s. */
    @PluginMethod
    fun getCurrentPosition(call: PluginCall) {
        if (PlaceLocator.hasPrecise(context)) findPosition(call)
        else requestPermissionForAlias("preciseLocation", call, "onPositionPermission")
    }

    @PermissionCallback
    private fun onPositionPermission(call: PluginCall) {
        if (PlaceLocator.hasPrecise(context)) findPosition(call)
        else call.reject("Autorisation de position précise refusée : accorde-la dans les réglages de l'app", "PERMISSION_DENIED")
    }

    private fun findPosition(call: PluginCall) {
        PlaceLocator.fresh(context, PlaceLocator.FIX_TIMEOUT_MS) { location ->
            if (location == null) {
                call.reject("Position introuvable ou trop imprécise : active la localisation, puis réessaie près d'une fenêtre ou dehors", "UNAVAILABLE")
            } else {
                val position = JSObject().put("latitude", location.latitude).put("longitude", location.longitude)
                if (location.hasAccuracy()) position.put("accuracy", location.accuracy.toDouble())
                call.resolve(position)
            }
        }
    }

    @PluginMethod
    fun getLocationPermissions(call: PluginCall) = call.resolve(locationPermissions())

    /**
     * Autorisations de « Selon le lieu » : position précise d'abord, puis (Android 10+) « Toujours
     * autoriser », qui permet de lire la position app fermée. À partir d'Android 11, ce dernier accès ne se
     * donne plus dans une boîte de dialogue mais dans les réglages de l'app : on les ouvre et on renvoie
     * la consigne à afficher.
     */
    @PluginMethod
    fun requestLocationPermissions(call: PluginCall) {
        if (PlaceLocator.hasPrecise(context)) {
            requestBackgroundLocation(call)
            return
        }
        // Refusée pour de bon (« ne plus demander ») : le système n'affiche plus rien, seuls les réglages peuvent l'accorder.
        if (getPermissionState("preciseLocation") == PermissionState.DENIED) {
            call.resolve(permissionResult(openAppSettings(), "Autorise la position précise dans les réglages de l'app (Autorisations › Position)."))
            return
        }
        requestPermissionForAlias("preciseLocation", call, "onPreciseLocationResult")
    }

    @PermissionCallback
    private fun onPreciseLocationResult(call: PluginCall) {
        if (PlaceLocator.hasPrecise(context)) requestBackgroundLocation(call) else call.resolve(permissionResult())
    }

    private fun requestBackgroundLocation(call: PluginCall) {
        when {
            PlaceLocator.hasBackground(context) -> call.resolve(permissionResult())
            // Android 10 : la boîte de dialogue propose encore « Toujours autoriser ».
            Build.VERSION.SDK_INT < 30 -> requestPermissionForAlias("backgroundLocation", call, "onBackgroundLocationResult")
            else -> call.resolve(permissionResult(openAppSettings(), alwaysAllowHint()))
        }
    }

    @PermissionCallback
    private fun onBackgroundLocationResult(call: PluginCall) = call.resolve(permissionResult())

    private fun locationPermissions() =
        JSObject().put("precise", PlaceLocator.hasPrecise(context)).put("background", PlaceLocator.hasBackground(context))

    private fun permissionResult(settingsOpened: Boolean = false, message: String? = null): JSObject {
        val result = locationPermissions().put("settingsOpened", settingsOpened)
        if (message != null) result.put("message", message)
        return result
    }

    private fun openAppSettings(): Boolean {
        val host = activity ?: return false
        val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null))
        return runCatching { host.startActivity(intent) }.isSuccess
    }

    /** Consigne pour l'accès « Toujours » ; son libellé exact vient du système (Android 11+), dans la langue de l'appareil. */
    private fun alwaysAllowHint(): String {
        val label = if (Build.VERSION.SDK_INT >= 30) context.packageManager.backgroundPermissionOptionLabel.toString() else ""
        return "Dans les réglages de l'app, ouvre Autorisations › Position et choisis « ${label.ifBlank { "Toujours autoriser" }} »."
    }

    private companion object {
        const val MAX_LOCATION_AGE_MS = 6 * 60 * 60_000L
        const val LOCATION_TIMEOUT_MS = 15_000L
    }
}
