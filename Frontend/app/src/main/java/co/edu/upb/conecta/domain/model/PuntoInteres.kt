package co.edu.upb.conecta.domain.model

enum class CategoriaPunto(val etiqueta: String) {
    BLOQUE_ACADEMICO("Bloque académico"),
    BIBLIOTECA("Biblioteca"),
    BIENESTAR("Bienestar universitario"),
    COORDINACION("Coordinación de programa"),
    SERVICIOS("Servicios / cafetería"),
    DEPORTES("Zona deportiva"),
    PARQUEADERO("Parqueadero")
}

/**
 * Punto de interés del campus. [x] e [y] son coordenadas relativas (0f..1f)
 * sobre el lienzo del mapa preliminar — ver MapaScreen. Cuando se integre un
 * mapa real (p. ej. Google Maps / plano georreferenciado), esto se traduce
 * a coordenadas geográficas o a un mapa de imagen con puntos ancla.
 */
data class PuntoInteres(
    val id: String,
    val nombre: String,
    val categoria: CategoriaPunto,
    val descripcion: String,
    val x: Float,
    val y: Float
)
