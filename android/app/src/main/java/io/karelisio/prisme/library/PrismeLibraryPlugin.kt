package io.karelisio.prisme.library

import android.app.Activity
import android.content.Context
import android.content.Intent
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.mlkit.common.MlKit
import com.google.mlkit.common.MlKitException
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScanner
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning

/**
 * Partage de collections sans compte : liens « prisme://collection/<code> » ouverts depuis une
 * messagerie ou le navigateur, et scanner de QR code de Google Play services (sans permission caméra).
 */
@CapacitorPlugin(name = "PrismeLibrary")
class PrismeLibraryPlugin : Plugin() {
    /**
     * Lien reçu : au lancement (Capacitor rejoue l'intent de démarrage ici) comme app ouverte.
     * L'événement est gardé jusqu'à ce que l'interface écoute, car l'app peut être lancée par le lien.
     */
    override fun handleOnNewIntent(intent: Intent) {
        super.handleOnNewIntent(intent)
        val fromHistory = intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY != 0
        val link = CollectionLinks.accept(intent.action, intent.dataString, fromHistory) ?: return
        notifyListeners(EVENT_LINK, JSObject().put("url", link), true)
    }

    /**
     * Ouvre le scanner de Google Play services (il gère la caméra lui-même) ; `cancelled` si
     * l'utilisateur le referme sans rien scanner. Sans services Google Play : rejette `UNAVAILABLE`.
     */
    @PluginMethod
    fun scanQr(call: PluginCall) {
        val host = activity
        if (host == null) {
            call.reject("Écran indisponible", CODE_UNAVAILABLE)
            return
        }
        val problem = playServicesProblem(host)
        if (problem != null) {
            call.reject(problem, CODE_UNAVAILABLE)
            return
        }
        val scanner = try {
            // ML Kit n'est pas initialisé au démarrage de l'app (fournisseur retiré du manifeste) : seulement ici.
            MlKit.initialize(host.applicationContext)
            scanner(host)
        } catch (e: RuntimeException) {
            call.reject(MESSAGE_NO_PLAY_SERVICES, CODE_UNAVAILABLE, e)
            return
        }
        scanner.startScan()
            .addOnSuccessListener { barcode -> call.resolve(JSObject().put("cancelled", false).put("value", barcode.rawValue.orEmpty())) }
            .addOnCanceledListener { call.resolve(JSObject().put("cancelled", true)) }
            .addOnFailureListener { error -> failScan(call, error) }
    }

    private fun scanner(host: Activity): GmsBarcodeScanner {
        val options = GmsBarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build()
        return GmsBarcodeScanning.getClient(host, options)
    }

    private fun failScan(call: PluginCall, error: Exception) {
        when ((error as? MlKitException)?.errorCode) {
            MlKitException.CODE_SCANNER_CANCELLED -> call.resolve(JSObject().put("cancelled", true))
            MlKitException.CODE_SCANNER_TASK_IN_PROGRESS -> call.reject("Un scan est déjà en cours", "BUSY", error)
            MlKitException.CODE_SCANNER_GOOGLE_PLAY_SERVICES_VERSION_TOO_OLD ->
                call.reject("Mets à jour les services Google Play pour utiliser le scanner", CODE_UNAVAILABLE, error)
            MlKitException.CODE_SCANNER_CAMERA_PERMISSION_NOT_GRANTED ->
                call.reject("Le scanner n'a pas accès à la caméra : autorise-la pour les services Google Play, puis réessaie", "CAMERA_DENIED", error)
            // Le module du scanner est téléchargé par Google Play services à la première utilisation.
            MlKitException.CODE_SCANNER_UNAVAILABLE, MlKitException.UNAVAILABLE, MlKitException.NETWORK_ISSUE ->
                call.reject("Le scanner se prépare (téléchargement par Google Play services) : réessaie dans un instant", "DOWNLOADING", error)
            else -> call.reject("Scan impossible : ${error.message ?: "erreur inconnue"}", "SCAN_FAILED", error)
        }
    }

    /** Message à afficher si les services Google Play manquent ou doivent être mis à jour ; null s'ils sont prêts. */
    private fun playServicesProblem(context: Context): String? {
        val status = try {
            GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context)
        } catch (e: RuntimeException) {
            ConnectionResult.SERVICE_MISSING
        }
        return when (status) {
            ConnectionResult.SUCCESS -> null
            ConnectionResult.SERVICE_VERSION_UPDATE_REQUIRED, ConnectionResult.SERVICE_UPDATING ->
                "Mets à jour les services Google Play pour utiliser le scanner"
            else -> MESSAGE_NO_PLAY_SERVICES
        }
    }

    private companion object {
        const val EVENT_LINK = "collectionLink"
        const val CODE_UNAVAILABLE = "UNAVAILABLE"
        const val MESSAGE_NO_PLAY_SERVICES = "Le scanner de QR code demande les services Google Play, absents de ce téléphone"
    }
}
