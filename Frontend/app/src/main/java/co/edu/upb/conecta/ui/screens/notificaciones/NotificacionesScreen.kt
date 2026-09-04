package co.edu.upb.conecta.ui.screens.notificaciones

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.Forum
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.WorkOutline
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import co.edu.upb.conecta.data.repository.NotificacionesRepository
import co.edu.upb.conecta.domain.model.Notificacion
import co.edu.upb.conecta.domain.model.TipoNotificacion
import co.edu.upb.conecta.ui.components.EstadoVacio
import co.edu.upb.conecta.ui.screens.foro.tiempoRelativo

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificacionesScreen(
    notificacionesRepository: NotificacionesRepository,
    onVolver: () -> Unit,
    modifier: Modifier = Modifier
) {
    val notificaciones = remember { notificacionesRepository.obtenerTodas() }

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = { Text("Notificaciones") },
                navigationIcon = {
                    IconButton(onClick = onVolver) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Volver")
                    }
                }
            )
        }
    ) { padding ->
        if (notificaciones.isEmpty()) {
            EstadoVacio("No tienes notificaciones por ahora.", modifier = Modifier.padding(padding).fillMaxSize())
            return@Scaffold
        }
        LazyColumn(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize(),
            contentPadding = PaddingValues(16.dp)
        ) {
            items(notificaciones, key = { it.id }) { notificacion ->
                TarjetaNotificacion(notificacion, modifier = Modifier.padding(bottom = 10.dp))
            }
        }
    }
}

private fun iconoTipo(tipo: TipoNotificacion): ImageVector = when (tipo) {
    TipoNotificacion.CONVOCATORIA -> Icons.Filled.Campaign
    TipoNotificacion.PRACTICA -> Icons.Filled.WorkOutline
    TipoNotificacion.FORO -> Icons.Filled.Forum
    TipoNotificacion.SISTEMA -> Icons.Filled.Info
}

@Composable
private fun TarjetaNotificacion(notificacion: Notificacion, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = if (notificacion.leida) MaterialTheme.colorScheme.surface
            else MaterialTheme.colorScheme.primaryContainer
        )
    ) {
        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.Top) {
            Surface(
                shape = CircleShape,
                color = MaterialTheme.colorScheme.primary.copy(alpha = 0.15f)
            ) {
                Icon(
                    imageVector = iconoTipo(notificacion.tipo),
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier
                        .padding(8.dp)
                        .size(20.dp)
                )
            }
            Spacer(modifier = Modifier.padding(start = 6.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = notificacion.titulo,
                    style = MaterialTheme.typography.titleSmall
                )
                Spacer(modifier = Modifier.padding(top = 2.dp))
                Text(
                    text = notificacion.cuerpo,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.75f)
                )
                Spacer(modifier = Modifier.padding(top = 4.dp))
                Text(
                    text = tiempoRelativo(notificacion.fecha),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
                )
            }
        }
    }
}
