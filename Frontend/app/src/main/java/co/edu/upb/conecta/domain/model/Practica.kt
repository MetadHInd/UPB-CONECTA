package co.edu.upb.conecta.domain.model

import java.time.LocalDate

enum class ModalidadPractica(val etiqueta: String) {
    PRESENCIAL("Presencial"),
    REMOTA("Remota"),
    HIBRIDA("Híbrida")
}

/**
 * Oferta de práctica / pasantía. Hoy se dispersa entre correo, carteleras y
 * anuncios de cada coordinación; aquí vive en un listado único, clasificado
 * por programa destino.
 */
data class Practica(
    val id: String,
    val empresa: String,
    val cargo: String,
    val programasDestino: List<Programa>,
    val modalidad: ModalidadPractica,
    val ubicacion: String,
    val fechaCierre: LocalDate,
    val descripcion: String,
    val requisitos: List<String>,
    val contactoCoordinacion: String
) {
    fun diasParaCierre(hoy: LocalDate = LocalDate.now()): Long =
        java.time.temporal.ChronoUnit.DAYS.between(hoy, fechaCierre)

    fun esUrgente(hoy: LocalDate = LocalDate.now()): Boolean =
        diasParaCierre(hoy) in 0..3
}
