package co.edu.upb.conecta.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudDone
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import co.edu.upb.conecta.data.cache.EstadoSincronizacion
import java.time.Instant

/**
 * Indicador de frescura de las convocatorias (HU-17). Sin conexión o tras
 * un fallo se muestra como advertencia con la fecha y hora de la última
 * actualización; con red y al día, como una línea discreta.
 */
@Composable
fun IndicadorActualizacion(estado: EstadoSincronizacion, modifier: Modifier = Modifier) {
    val texto = textoIndicador(estado, Instant.now())
    val icono = when {
        !estado.hayConexion -> Icons.Filled.CloudOff
        estado.sincronizando -> Icons.Filled.Sync
        else -> Icons.Filled.CloudDone
    }

    if (!texto.esAdvertencia && texto.detalle.isEmpty()) {
        Row(
            modifier = modifier.padding(horizontal = 16.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Icon(
                icono,
                contentDescription = null,
                modifier = Modifier.size(14.dp),
                tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
            )
            Text(
                text = texto.titulo,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
            )
        }
        return
    }

    val (fondo, contenido) = if (texto.esAdvertencia) {
        MaterialTheme.colorScheme.errorContainer to MaterialTheme.colorScheme.onErrorContainer
    } else {
        MaterialTheme.colorScheme.secondaryContainer to MaterialTheme.colorScheme.onSecondaryContainer
    }
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp),
        shape = MaterialTheme.shapes.medium,
        color = fondo,
        contentColor = contenido
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Icon(icono, contentDescription = null, modifier = Modifier.size(20.dp))
            Column {
                Text(text = texto.titulo, style = MaterialTheme.typography.labelLarge)
                if (texto.detalle.isNotEmpty()) {
                    Text(text = texto.detalle, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}
