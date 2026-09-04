package co.edu.upb.conecta.domain.model

import java.time.LocalDate

enum class CategoriaConvocatoria(val etiqueta: String) {
    CURSO_REQUISITO("Curso requisito"),
    BECA_APOYO("Beca / apoyo económico"),
    TRAMITE_ACADEMICO("Trámite académico"),
    EVENTO("Evento"),
    MOVILIDAD("Movilidad / intercambio"),
    ADMINISTRATIVA("Administrativa")
}

/**
 * Convocatoria con fecha de cierre — el objeto central del problema que ataca
 * UPB Conecta: en el correo masivo, esto llega con el mismo peso visual que
 * un boletín cualquiera. Aquí se prioriza explícitamente por [fechaCierre].
 */
data class Convocatoria(
    val id: String,
    val titulo: String,
    val descripcion: String,
    val categoria: CategoriaConvocatoria,
    val programas: List<Programa>, // lista vacía = dirigida a toda la comunidad
    val fechaPublicacion: LocalDate,
    val fechaCierre: LocalDate,
    val fuenteOriginal: String, // p. ej. "Correo institucional" / "Coordinación de Sistemas"
    val coordinacionResponsable: String
) {
    val esParaTodos: Boolean get() = programas.isEmpty()

    fun diasParaCierre(hoy: LocalDate = LocalDate.now()): Long =
        java.time.temporal.ChronoUnit.DAYS.between(hoy, fechaCierre)

    /** Cierra en 3 días o menos: la clasificación que el correo masivo no hace. */
    fun esUrgente(hoy: LocalDate = LocalDate.now()): Boolean =
        diasParaCierre(hoy) in 0..3

    fun yaCerro(hoy: LocalDate = LocalDate.now()): Boolean =
        fechaCierre.isBefore(hoy)
}
