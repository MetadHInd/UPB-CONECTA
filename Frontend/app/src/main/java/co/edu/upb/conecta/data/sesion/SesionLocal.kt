package co.edu.upb.conecta.data.sesion

/**
 * Algo guardado en el dispositivo que pertenece a la sesión del usuario:
 * se activa al iniciar sesión y se borra al cerrarla (HU-17, criterio 5).
 */
interface CacheDeSesion {
    /** Empieza a sincronizar. Llamar desde el hilo principal. */
    fun activar()

    /** Deja de sincronizar y borra todo lo guardado localmente. */
    suspend fun borrarContenidoLocal()
}

/**
 * Ciclo de vida del contenido local ligado a la sesión. Cada caché nueva
 * (prácticas, noticias...) se registra en [AppContainer] y queda cubierta por
 * el mismo cierre de sesión, sin que la pantalla de perfil tenga que conocerla.
 */
class SesionLocal(private val caches: List<CacheDeSesion>) {

    fun alIniciarSesion() {
        caches.forEach { it.activar() }
    }

    suspend fun alCerrarSesion() {
        caches.forEach { it.borrarContenidoLocal() }
    }
}
