package co.edu.upb.conecta.domain.model

import java.time.LocalDate

enum class CategoriaNoticia(val etiqueta: String) {
    INSTITUCIONAL("Institucional"),
    EVENTO("Evento"),
    LOGRO("Logro"),
    BIENESTAR("Bienestar"),
    CULTURA("Cultura y deporte")
}

/**
 * Noticia institucional. A diferencia de las convocatorias, no tiene fecha
 * límite — es la sección de "apartado de noticias con scrolling" pedida
 * explícitamente para este front preliminar (ver NoticiasScreen).
 */
data class Noticia(
    val id: String,
    val titulo: String,
    val resumen: String,
    val cuerpo: String,
    val categoria: CategoriaNoticia,
    val fechaPublicacion: LocalDate,
    val fuente: String,
    val destacada: Boolean = false,
    // Contadores de interacción simulados, al estilo de una publicación de
    // red social (ver TarjetaNoticia en NoticiasScreen) — no vienen de un
    // backend real todavía.
    val likes: Int = 0,
    val comentarios: Int = 0
)
