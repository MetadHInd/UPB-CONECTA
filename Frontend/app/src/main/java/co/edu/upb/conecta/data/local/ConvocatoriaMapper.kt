package co.edu.upb.conecta.data.local

import co.edu.upb.conecta.domain.model.CategoriaConvocatoria
import co.edu.upb.conecta.domain.model.Convocatoria
import co.edu.upb.conecta.domain.model.Programa
import java.time.LocalDate

fun Convocatoria.aEntidad(orden: Int): ConvocatoriaEntity = ConvocatoriaEntity(
    id = id,
    titulo = titulo,
    descripcion = descripcion,
    categoria = categoria.name,
    fechaPublicacionEpochDay = fechaPublicacion.toEpochDay(),
    fechaCierreEpochDay = fechaCierre.toEpochDay(),
    fuenteOriginal = fuenteOriginal,
    coordinacionResponsable = coordinacionResponsable,
    orden = orden
)

fun Convocatoria.programasAEntidades(): List<ConvocatoriaProgramaEntity> =
    programas.mapIndexed { orden, programa ->
        ConvocatoriaProgramaEntity(
            convocatoriaId = id,
            programaId = programa.id,
            nombre = programa.nombre,
            facultad = programa.facultad,
            orden = orden
        )
    }

fun ConvocatoriaConProgramas.aDominio(): Convocatoria = Convocatoria(
    id = convocatoria.id,
    titulo = convocatoria.titulo,
    descripcion = convocatoria.descripcion,
    categoria = CategoriaConvocatoria.valueOf(convocatoria.categoria),
    programas = programas.sortedBy { it.orden }.map { Programa(it.programaId, it.nombre, it.facultad) },
    fechaPublicacion = LocalDate.ofEpochDay(convocatoria.fechaPublicacionEpochDay),
    fechaCierre = LocalDate.ofEpochDay(convocatoria.fechaCierreEpochDay),
    fuenteOriginal = convocatoria.fuenteOriginal,
    coordinacionResponsable = convocatoria.coordinacionResponsable
)
