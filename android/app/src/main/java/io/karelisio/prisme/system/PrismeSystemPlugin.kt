package io.karelisio.prisme.system

import android.app.Activity
import android.app.StatusBarManager
import android.content.ComponentName
import android.content.Intent
import android.graphics.drawable.Icon
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Build
import android.view.HapticFeedbackConstants
import androidx.activity.result.ActivityResult
import androidx.annotation.RequiresApi
import androidx.core.content.pm.PackageInfoCompat
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.PermissionState
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import io.karelisio.prisme.R
import io.karelisio.prisme.quick.NextWallpaperTileService
import io.karelisio.prisme.wallpaper.WallpaperException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

/**
 * Services de l'app hors fonds d'écran : version et mises à jour, réseau, vibrations, fichiers
 * (sauvegarde), partage de texte, journal d'erreurs, notification du jour et actions lancées
 * depuis les raccourcis.
 */
@CapacitorPlugin(
    name = "PrismeSystem",
    permissions = [Permission(alias = "notifications", strings = ["android.permission.POST_NOTIFICATIONS"])],
)
class PrismeSystemPlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private lateinit var updater: UpdateInstaller
    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    private var lastNetwork: Pair<Boolean, Boolean>? = null
    private var pendingAction: String? = null
    private var downloadedUpdate: File? = null

    override fun load() {
        updater = UpdateInstaller(context)
        pendingAction = AppActions.fromIntent(activity?.intent)
        val manager = context.getSystemService(ConnectivityManager::class.java) ?: return
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) = emitNetwork()
            override fun onLost(network: Network) = emitNetwork()
        }
        runCatching { manager.registerDefaultNetworkCallback(callback) }.onSuccess { networkCallback = callback }
    }

    override fun handleOnNewIntent(intent: Intent) {
        super.handleOnNewIntent(intent)
        val action = AppActions.fromIntent(intent) ?: return
        notifyListeners(EVENT_ACTION, JSObject().put("action", action), true)
    }

    override fun handleOnDestroy() {
        networkCallback?.let { callback ->
            runCatching { context.getSystemService(ConnectivityManager::class.java)?.unregisterNetworkCallback(callback) }
        }
        scope.cancel()
        super.handleOnDestroy()
    }

    @PluginMethod
    fun getAppInfo(call: PluginCall) {
        val info = context.packageManager.getPackageInfo(context.packageName, 0)
        call.resolve(
            JSObject()
                .put("packageName", context.packageName)
                .put("versionName", info.versionName)
                .put("versionCode", PackageInfoCompat.getLongVersionCode(info))
                .put("canInstallPackages", updater.canInstall()),
        )
    }

    @PluginMethod
    fun getNetworkStatus(call: PluginCall) {
        val (connected, metered) = readNetwork()
        call.resolve(JSObject().put("connected", connected).put("metered", metered))
    }

    @PluginMethod
    fun haptic(call: PluginCall) {
        val constant = when (call.getString("kind")) {
            "confirm" -> if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.VIRTUAL_KEY
            "reject" -> if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.REJECT else HapticFeedbackConstants.LONG_PRESS
            "long" -> HapticFeedbackConstants.LONG_PRESS
            else -> HapticFeedbackConstants.CLOCK_TICK
        }
        // Respecte le réglage « vibrations au toucher » du système.
        activity?.runOnUiThread { activity?.window?.decorView?.performHapticFeedback(constant) }
        call.resolve()
    }

    /** Enregistre un fichier texte là où l'utilisateur le choisit (Documents, Drive…). */
    @PluginMethod
    fun exportFile(call: PluginCall) {
        val name = call.getString("fileName")
        if (name.isNullOrBlank() || call.getString("data") == null) {
            call.reject("Fichier à exporter manquant", "INVALID_ARGUMENT")
            return
        }
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType(call.getString("mimeType") ?: "application/json")
            .putExtra(Intent.EXTRA_TITLE, name)
        startActivityForResult(call, intent, "onExportResult")
    }

    @ActivityCallback
    private fun onExportResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val uri = result.data?.data
        if (result.resultCode != Activity.RESULT_OK || uri == null) {
            call.resolve(JSObject().put("saved", false))
            return
        }
        val data = call.getString("data").orEmpty()
        scope.launch {
            try {
                withContext(Dispatchers.IO) {
                    context.contentResolver.openOutputStream(uri, "wt")?.use { it.write(data.toByteArray(Charsets.UTF_8)) }
                        ?: throw WallpaperException("WRITE_FAILED", "Impossible d'écrire le fichier")
                }
                call.resolve(JSObject().put("saved", true))
            } catch (e: Exception) {
                call.reject(e.message ?: "Impossible d'écrire le fichier", "WRITE_FAILED", e)
            }
        }
    }

    /** Lit un fichier texte choisi par l'utilisateur (restauration d'une sauvegarde). */
    @PluginMethod
    fun importFile(call: PluginCall) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType("*/*")
            .putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("application/json", "text/plain", "application/octet-stream"))
        startActivityForResult(call, intent, "onImportResult")
    }

    @ActivityCallback
    private fun onImportResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val uri = result.data?.data
        if (result.resultCode != Activity.RESULT_OK || uri == null) {
            call.resolve(JSObject().put("cancelled", true))
            return
        }
        scope.launch {
            try {
                val text = withContext(Dispatchers.IO) {
                    context.contentResolver.openInputStream(uri)?.use { input ->
                        val bytes = input.readNBytesCompat(MAX_IMPORT_BYTES + 1)
                        if (bytes.size > MAX_IMPORT_BYTES) throw WallpaperException("TOO_LARGE", "Fichier trop volumineux")
                        String(bytes, Charsets.UTF_8)
                    } ?: throw WallpaperException("READ_FAILED", "Impossible de lire le fichier")
                }
                call.resolve(JSObject().put("cancelled", false).put("data", text))
            } catch (e: WallpaperException) {
                call.reject(e.message, e.code, e)
            } catch (e: Exception) {
                call.reject("Impossible de lire le fichier", "READ_FAILED", e)
            }
        }
    }

    @PluginMethod
    fun shareText(call: PluginCall) {
        val text = call.getString("text")
        val host = activity
        if (text.isNullOrBlank() || host == null) {
            call.reject("Texte à partager manquant", "INVALID_ARGUMENT")
            return
        }
        val title = call.getString("title") ?: "Partager"
        val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text).putExtra(Intent.EXTRA_SUBJECT, title)
        host.startActivity(Intent.createChooser(send, title))
        call.resolve()
    }

    @PluginMethod
    fun getErrorLog(call: PluginCall) {
        scope.launch {
            val entries = withContext(Dispatchers.IO) { ErrorLog.entries(context) }
            call.resolve(JSObject().put("entries", JSArray(entries)))
        }
    }

    @PluginMethod
    fun clearErrorLog(call: PluginCall) {
        scope.launch {
            withContext(Dispatchers.IO) { ErrorLog.clear(context) }
            call.resolve()
        }
    }

    /** Télécharge et vérifie l'APK d'une release ; [installUpdate] l'installe ensuite. */
    @PluginMethod
    fun downloadUpdate(call: PluginCall) {
        val url = call.getString("url")
        if (url.isNullOrBlank()) {
            call.reject("Adresse de mise à jour manquante", "INVALID_ARGUMENT")
            return
        }
        scope.launch {
            try {
                val file = withContext(Dispatchers.IO) {
                    updater.download(url) { progress ->
                        val data = JSObject().put("progress", progress.toDouble())
                        bridge.executeOnMainThread { notifyListeners(EVENT_UPDATE_PROGRESS, data) }
                    }
                }
                downloadedUpdate = file
                call.resolve(JSObject().put("ready", true))
            } catch (e: WallpaperException) {
                call.reject(e.message, e.code, e)
            } catch (e: Exception) {
                call.reject(e.message ?: "Téléchargement impossible", "DOWNLOAD_FAILED", e)
            }
        }
    }

    @PluginMethod
    fun installUpdate(call: PluginCall) {
        val host = activity
        val file = downloadedUpdate ?: updater.cached()
        if (host == null || file == null) {
            call.reject("Aucune mise à jour téléchargée", "NOT_FOUND")
            return
        }
        try {
            updater.install(host, file)
            call.resolve()
        } catch (e: WallpaperException) {
            call.reject(e.message, e.code, e)
        }
    }

    @PluginMethod
    fun openInstallSettings(call: PluginCall) {
        val host = activity
        if (host == null || Build.VERSION.SDK_INT < 26) {
            call.resolve()
            return
        }
        host.startActivity(updater.permissionSettingsIntent())
        call.resolve()
    }

    /** Android 13+ : propose d'ajouter la tuile « Fond suivant » aux Réglages rapides. */
    @PluginMethod
    fun requestAddTile(call: PluginCall) {
        if (Build.VERSION.SDK_INT < 33) {
            call.resolve(JSObject().put("result", "unsupported"))
            return
        }
        requestTile(call)
    }

    @RequiresApi(33)
    private fun requestTile(call: PluginCall) {
        val manager = context.getSystemService(StatusBarManager::class.java)
        if (manager == null) {
            call.resolve(JSObject().put("result", "unsupported"))
            return
        }
        val component = ComponentName(context, NextWallpaperTileService::class.java)
        val icon = Icon.createWithResource(context, R.drawable.ic_tile_next)
        manager.requestAddTileService(component, context.getString(R.string.tile_next), icon, context.mainExecutor) { result ->
            val status = when (result) {
                StatusBarManager.TILE_ADD_REQUEST_RESULT_TILE_ADDED -> "added"
                StatusBarManager.TILE_ADD_REQUEST_RESULT_TILE_ALREADY_ADDED -> "already"
                StatusBarManager.TILE_ADD_REQUEST_RESULT_TILE_NOT_ADDED -> "declined"
                else -> "error"
            }
            call.resolve(JSObject().put("result", status))
        }
    }

    /** Notification « Fond du jour » ; avec `prompt`, demande l'autorisation (Android 13+) si besoin. */
    @PluginMethod
    fun setDailyNotification(call: PluginCall) {
        val enabled = call.getBoolean("enabled", false) == true
        val hour = (call.getInt("hour") ?: 9).coerceIn(0, 23)
        DailyNotifier.configure(context, enabled, hour)
        val prompt = call.getBoolean("prompt", false) == true
        if (enabled && prompt && Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "onNotificationPermission")
            return
        }
        resolveDaily(call, enabled)
    }

    @PermissionCallback
    private fun onNotificationPermission(call: PluginCall) = resolveDaily(call, true)

    private fun resolveDaily(call: PluginCall, enabled: Boolean) {
        val permission = if (DailyNotifier.notificationsAllowed(context)) "granted" else "denied"
        call.resolve(JSObject().put("enabled", enabled).put("permission", permission))
    }

    /** Action demandée au lancement par un raccourci (une seule fois). */
    @PluginMethod
    fun getPendingAction(call: PluginCall) {
        val action = pendingAction
        pendingAction = null
        call.resolve(JSObject().put("action", action))
    }

    private fun readNetwork(): Pair<Boolean, Boolean> {
        val manager = context.getSystemService(ConnectivityManager::class.java) ?: return false to false
        val capabilities = manager.getNetworkCapabilities(manager.activeNetwork)
        val connected = capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
        return connected to manager.isActiveNetworkMetered
    }

    /** Appelé depuis le fil du gestionnaire réseau : on ne notifie que les vrais changements. */
    @Synchronized
    private fun emitNetwork() {
        val status = readNetwork()
        if (status == lastNetwork) return
        lastNetwork = status
        val data = JSObject().put("connected", status.first).put("metered", status.second)
        bridge.executeOnMainThread { notifyListeners(EVENT_NETWORK, data) }
    }

    private companion object {
        const val EVENT_ACTION = "appAction"
        const val EVENT_NETWORK = "networkChanged"
        const val EVENT_UPDATE_PROGRESS = "updateProgress"
        const val MAX_IMPORT_BYTES = 10 * 1024 * 1024
    }
}

/**
 * Actions qui ouvrent l'app : raccourci « Rechercher » et notification « Fond du jour » (les autres
 * raccourcis passent par QuickActionActivity).
 */
internal object AppActions {
    const val PREFIX = "io.karelisio.prisme.action."
    private val forApp = setOf("SEARCH", "DAILY")

    fun fromIntent(intent: Intent?): String? {
        val action = intent?.action ?: return null
        if (!action.startsWith(PREFIX)) return null
        return action.removePrefix(PREFIX).takeIf { it in forApp }
    }
}

/** Lecture bornée (InputStream.readNBytes n'existe qu'à partir d'Android 13). */
private fun java.io.InputStream.readNBytesCompat(max: Int): ByteArray {
    val out = java.io.ByteArrayOutputStream()
    val buffer = ByteArray(64 * 1024)
    while (out.size() < max) {
        val read = read(buffer, 0, minOf(buffer.size, max - out.size()))
        if (read < 0) break
        out.write(buffer, 0, read)
    }
    return out.toByteArray()
}
