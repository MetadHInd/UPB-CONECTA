package co.edu.upb.conecta.data.cache

import java.time.Instant

/** Lo que la UI necesita saber de la caché para no presentar datos viejos como vigentes. */
data class EstadoSincronizacion(
    val ultimaSincronizacion: Instant?,
    val hayConexion: Boolean,
    val sincronizando: Boolean,
    val falloUltimoIntento: Boolean
)

sealed interface ResultadoSincronizacion {
    data object Exito : ResultadoSincronizacion
    data object SinConexion : ResultadoSincronizacion
    data class Error(val causa: Exception) : ResultadoSincronizacion
}
