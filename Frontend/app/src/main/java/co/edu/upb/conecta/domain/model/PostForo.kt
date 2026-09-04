package co.edu.upb.conecta.domain.model

import java.time.LocalDateTime

enum class EstadoModeracion {
    APROBADO,
    EN_REVISION,
    OCULTO_AUTOMATICAMENTE
}

data class ComentarioForo(
    val id: String,
    val autorNombre: String,
    val autorVerificado: Boolean,
    val contenido: String,
    val fecha: LocalDateTime
)

/**
 * Hilo del foro estudiantil. [autorVerificado] refleja la identidad
 * verificada institucionalmente (RF de "foro con identidad verificada");
 * [estadoModeracion] refleja el resultado de la moderación automática.
 */
data class PostForo(
    val id: String,
    val titulo: String,
    val contenido: String,
    val autorNombre: String,
    val autorVerificado: Boolean,
    val programa: Programa,
    val fecha: LocalDateTime,
    val likes: Int,
    val estadoModeracion: EstadoModeracion,
    val comentarios: List<ComentarioForo> = emptyList()
)
