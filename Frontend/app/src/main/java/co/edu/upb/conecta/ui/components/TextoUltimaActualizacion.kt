package co.edu.upb.conecta.ui.components

import co.edu.upb.conecta.data.cache.EstadoSincronizacion
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Texto del indicador de última actualización del feed (HU-17, criterios 2
 * y 3). Es Kotlin puro — sin Compose ni Android — para probar sin emulador
 * qué se le dice al estudiante según haya red, se esté sincronizando o no, y
 * cuánto hace que se sincronizó.
 */
data class TextoIndicador(
    val titulo: String,
    val detalle: String,
    /** `true` si el dato mostrado puede no estar vigente y hay que destacarlo. */
    val esAdvertencia: Boolean
)

fun textoIndicador(
    estado: EstadoSincronizacion,
    ahora: Instant,
    zona: ZoneId = ZoneId.systemDefault()
): TextoIndicador {
    val ultima = estado.ultimaSincronizacion
    val cuando = ultima?.let { "Última actualización: ${describirMomento(it, ahora, zona)}." }
    return when {
        !estado.hayConexion && ultima == null -> TextoIndicador(
            titulo = "Sin conexión",
            detalle = "Todavía no hay convocatorias guardadas en este dispositivo. Conéctate para descargarlas.",
            esAdvertencia = true
        )
        !estado.hayConexion -> TextoIndicador(
            titulo = "Sin conexión · mostrando convocatorias guardadas",
            detalle = "$cuando Los plazos pueden haber cambiado desde entonces.",
            esAdvertencia = true
        )
        estado.sincronizando -> TextoIndicador(
            titulo = "Actualizando convocatorias…",
            detalle = cuando ?: "Descargando por primera vez.",
            esAdvertencia = false
        )
        estado.falloUltimoIntento -> TextoIndicador(
            titulo = "No se pudieron actualizar las convocatorias",
            detalle = cuando?.let { "$it Se reintentará cuando vuelva la conexión." }
                ?: "Se reintentará cuando vuelva la conexión.",
            esAdvertencia = true
        )
        ultima == null -> TextoIndicador(
            titulo = "Actualizando convocatorias…",
            detalle = "Descargando por primera vez.",
            esAdvertencia = false
        )
        else -> TextoIndicador(
            titulo = "Actualizado ${describirMomento(ultima, ahora, zona)}",
            detalle = "",
            esAdvertencia = false
        )
    }
}

private val localeCo = Locale("es", "CO")
private val formatoHora = DateTimeFormatter.ofPattern("HH:mm", localeCo)
private val formatoDiaMes = DateTimeFormatter.ofPattern("d 'de' MMMM", localeCo)
private val formatoDiaMesAnio = DateTimeFormatter.ofPattern("d 'de' MMMM 'de' yyyy", localeCo)

/** "hoy a las 15:40", "ayer a las 09:05" o "20 de septiembre a las 15:40". */
fun describirMomento(momento: Instant, ahora: Instant, zona: ZoneId): String {
    val fechaHora = momento.atZone(zona)
    val hoy = ahora.atZone(zona).toLocalDate()
    val dia = fechaHora.toLocalDate()
    val hora = fechaHora.format(formatoHora)
    return when {
        dia == hoy -> "hoy a las $hora"
        dia == hoy.minusDays(1) -> "ayer a las $hora"
        dia.year == hoy.year -> "${fechaHora.format(formatoDiaMes)} a las $hora"
        else -> "${fechaHora.format(formatoDiaMesAnio)} a las $hora"
    }
}
