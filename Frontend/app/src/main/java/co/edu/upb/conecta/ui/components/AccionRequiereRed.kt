package co.edu.upb.conecta.ui.components

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import co.edu.upb.conecta.data.conectividad.ConnectivityObserver
import co.edu.upb.conecta.domain.conectividad.AccionConRed
import co.edu.upb.conecta.domain.conectividad.AvisoSinConexion
import co.edu.upb.conecta.domain.conectividad.DecisionAccionConRed
import co.edu.upb.conecta.domain.conectividad.PoliticaAccionConRed

/**
 * Mecanismo reutilizable de "esta acción requiere red" (HU-17, criterio 4).
 *
 * Uso en cualquier pantalla de escritura:
 * ```
 * val ejecutor = rememberEjecutorAccionConRed(AppContainer.conectividad)
 * Button(onClick = { ejecutor.ejecutar(AccionConRed.PUBLICAR_EN_FORO) { publicar() } })
 * DialogoAccionRequiereRed(ejecutor)
 * ```
 * Con red, el bloque se ejecuta tal cual. Sin red, se muestra el aviso con
 * una acción sugerida y "Reintentar" vuelve a evaluar la conexión.
 */
@Stable
class EjecutorAccionConRed internal constructor(private val conectividad: ConnectivityObserver) {

    internal class Pendiente(val aviso: AvisoSinConexion, val accion: AccionConRed, val bloque: () -> Unit)

    internal var pendiente by mutableStateOf<Pendiente?>(null)
        private set

    fun ejecutar(accion: AccionConRed, bloque: () -> Unit) {
        when (val decision = PoliticaAccionConRed.evaluar(conectividad.hayConexion.value, accion)) {
            DecisionAccionConRed.Ejecutar -> bloque()
            is DecisionAccionConRed.Bloquear -> pendiente = Pendiente(decision.aviso, accion, bloque)
        }
    }

    internal fun reintentar() {
        val actual = pendiente ?: return
        pendiente = null
        ejecutar(actual.accion, actual.bloque)
    }

    internal fun descartar() {
        pendiente = null
    }
}

@Composable
fun rememberEjecutorAccionConRed(conectividad: ConnectivityObserver): EjecutorAccionConRed =
    remember(conectividad) { EjecutorAccionConRed(conectividad) }

@Composable
fun DialogoAccionRequiereRed(ejecutor: EjecutorAccionConRed) {
    val pendiente = ejecutor.pendiente ?: return
    AlertDialog(
        onDismissRequest = ejecutor::descartar,
        icon = { Icon(Icons.Filled.CloudOff, contentDescription = null) },
        title = { Text(pendiente.aviso.titulo) },
        text = {
            Column {
                Text(pendiente.aviso.mensaje)
                Spacer(modifier = Modifier.height(8.dp))
                Text(pendiente.aviso.accionSugerida)
            }
        },
        confirmButton = { TextButton(onClick = ejecutor::reintentar) { Text("Reintentar") } },
        dismissButton = { TextButton(onClick = ejecutor::descartar) { Text("Entendido") } }
    )
}
