package co.edu.upb.conecta.domain.model

data class ChatMessage(
    val id: String,
    val texto: String,
    val esUsuario: Boolean
)

data class PreguntaFrecuente(
    val pregunta: String,
    val respuesta: String
)
