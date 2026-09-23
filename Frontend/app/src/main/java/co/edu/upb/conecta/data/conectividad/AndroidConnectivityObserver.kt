package co.edu.upb.conecta.data.conectividad

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.CoroutineScope

/**
 * Adaptador de [ConnectivityObserver] sobre `ConnectivityManager.NetworkCallback`.
 *
 * Se eligió `NetworkCallback` y no WorkManager porque el criterio 3 de HU-17
 * habla de la app detectando la red mientras está abierta: el callback avisa
 * al instante, y además da el estado actual de la red que el indicador del
 * feed y el aviso de "acción requiere red" necesitan leer. WorkManager sirve
 * para sincronizar con la app cerrada, cosa que esta historia no pide.
 *
 * El callback se registra una sola vez en el scope de la aplicación
 * ([SharingStarted.Eagerly]) y vive lo que vive el proceso.
 */
class AndroidConnectivityObserver(
    context: Context,
    scope: CoroutineScope
) : ConnectivityObserver {

    private val connectivityManager =
        context.applicationContext.getSystemService(ConnectivityManager::class.java)

    override val hayConexion: StateFlow<Boolean> = callbackFlow {
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onCapabilitiesChanged(network: Network, capacidades: NetworkCapabilities) {
                trySend(tieneInternet(capacidades))
            }

            override fun onLost(network: Network) {
                trySend(false)
            }

            override fun onUnavailable() {
                trySend(false)
            }
        }
        connectivityManager.registerDefaultNetworkCallback(callback)
        awaitClose { connectivityManager.unregisterNetworkCallback(callback) }
    }
        .distinctUntilChanged()
        .stateIn(scope, SharingStarted.Eagerly, estadoActual())

    private fun estadoActual(): Boolean {
        val red = connectivityManager.activeNetwork ?: return false
        val capacidades = connectivityManager.getNetworkCapabilities(red) ?: return false
        return tieneInternet(capacidades)
    }

    private fun tieneInternet(capacidades: NetworkCapabilities): Boolean =
        capacidades.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            capacidades.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
}
