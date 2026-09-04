package co.edu.upb.conecta.domain.model

import java.time.LocalDateTime

enum class TipoNotificacion {
    CONVOCATORIA,
    PRACTICA,
    FORO,
    SISTEMA
}

/**
 * Notificación anticipada — RF de "notificaciones anticipadas" para que un
 * anuncio crítico no se descubra cuando la inscripción ya cerró.
 */
data class Notificacion(
    val id: String,
    val tipo: TipoNotificacion,
    val titulo: String,
    val cuerpo: String,
    val fecha: LocalDateTime,
    val leida: Boolean,
    val referenciaId: String? = null
)
