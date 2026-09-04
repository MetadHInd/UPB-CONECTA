package co.edu.upb.conecta.ui.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Forum
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Newspaper
import androidx.compose.material.icons.filled.Person
import androidx.compose.ui.graphics.vector.ImageVector

/** Rutas de navegación de UPB Conecta. */
object Rutas {
    const val SPLASH = "splash"
    const val LOGIN = "login"
    const val INICIO = "inicio"
    const val NOTICIAS = "noticias"
    const val FORO = "foro"
    const val MAPA = "mapa"
    const val PERFIL = "perfil"

    const val CONVOCATORIA_DETALLE = "convocatoria/{id}"
    const val PRACTICA_DETALLE = "practica/{id}"
    const val FORO_DETALLE = "foro-post/{id}"
    const val NOTIFICACIONES = "notificaciones"
    const val CHATBOT = "chatbot"

    fun convocatoriaDetalle(id: String) = "convocatoria/$id"
    fun practicaDetalle(id: String) = "practica/$id"
    fun foroDetalle(id: String) = "foro-post/$id"
}

data class DestinoBarraInferior(
    val ruta: String,
    val etiqueta: String,
    val icono: ImageVector
)

val destinosBarraInferior = listOf(
    DestinoBarraInferior(Rutas.INICIO, "Inicio", Icons.Filled.Home),
    DestinoBarraInferior(Rutas.NOTICIAS, "Noticias", Icons.Filled.Newspaper),
    DestinoBarraInferior(Rutas.FORO, "Foro", Icons.Filled.Forum),
    DestinoBarraInferior(Rutas.MAPA, "Mapa", Icons.Filled.Map),
    DestinoBarraInferior(Rutas.PERFIL, "Perfil", Icons.Filled.Person)
)
