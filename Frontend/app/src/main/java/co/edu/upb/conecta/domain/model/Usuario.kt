package co.edu.upb.conecta.domain.model

data class Usuario(
    val nombre: String,
    val correoInstitucional: String,
    val programa: Programa,
    val semestre: Int,
    val identidadVerificada: Boolean
)
