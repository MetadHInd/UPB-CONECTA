package co.edu.upb.conecta.data.conectividad

import kotlinx.coroutines.flow.StateFlow

/**
 * Puerto de conectividad (HU-17).
 *
 * La lógica de caché y de "acción requiere red" solo depende de esta
 * interfaz, nunca de `ConnectivityManager` directamente: así se prueba con
 * un doble (`MutableStateFlow`) sin emulador, igual que el backend prueba sus
 * casos de uso con adaptadores en memoria. El adaptador real es
 * [AndroidConnectivityObserver].
 */
interface ConnectivityObserver {
    /** `true` si el dispositivo tiene una red con salida a internet. */
    val hayConexion: StateFlow<Boolean>
}
