package co.edu.upb.conecta.domain.conectividad

/**
 * Acciones que no se pueden completar sin red (HU-17, criterio 4). Cada
 * pantalla de escritura futura agrega aquí su acción y reutiliza
 * [PoliticaAccionConRed] y el diálogo de `ui/components/AccionRequiereRed.kt`.
 */
enum class AccionConRed(val queIntenta: String, val queNoPaso: String) {
    POSTULAR_CONVOCATORIA(
        queIntenta = "postularte a una convocatoria",
        queNoPaso = "Tu postulación no se ha enviado."
    ),
    PUBLICAR_EN_FORO(
        queIntenta = "publicar en el foro",
        queNoPaso = "Tu publicación no se ha enviado."
    )
}

data class AvisoSinConexion(
    val titulo: String,
    val mensaje: String,
    val accionSugerida: String
)

sealed interface DecisionAccionConRed {
    data object Ejecutar : DecisionAccionConRed
    data class Bloquear(val aviso: AvisoSinConexion) : DecisionAccionConRed
}

object PoliticaAccionConRed {

    fun evaluar(hayConexion: Boolean, accion: AccionConRed): DecisionAccionConRed =
        if (hayConexion) {
            DecisionAccionConRed.Ejecutar
        } else {
            DecisionAccionConRed.Bloquear(
                AvisoSinConexion(
                    titulo = "Necesitas conexión",
                    mensaje = "Para ${accion.queIntenta} se necesita internet y ahora no tienes " +
                        "conexión. ${accion.queNoPaso}",
                    accionSugerida = "Busca una zona con señal o conéctate al Wi-Fi del campus y toca " +
                        "Reintentar. Mientras tanto puedes seguir consultando las convocatorias guardadas."
                )
            )
        }
}
