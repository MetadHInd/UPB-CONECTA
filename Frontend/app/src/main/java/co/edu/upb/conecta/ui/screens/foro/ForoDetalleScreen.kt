package co.edu.upb.conecta.ui.screens.foro

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import co.edu.upb.conecta.data.repository.ForoRepository
import co.edu.upb.conecta.domain.model.ComentarioForo
import co.edu.upb.conecta.domain.model.EstadoModeracion
import co.edu.upb.conecta.ui.components.EstadoVacio

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ForoDetalleScreen(
    id: String,
    foroRepository: ForoRepository,
    onVolver: () -> Unit,
    modifier: Modifier = Modifier
) {
    val post = remember(id) { foroRepository.obtenerPostPorId(id) }

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = { Text("Publicación") },
                navigationIcon = {
                    IconButton(onClick = onVolver) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Volver")
                    }
                }
            )
        }
    ) { padding ->
        if (post == null) {
            EstadoVacio("No se encontró la publicación.", modifier = Modifier.padding(padding))
            return@Scaffold
        }

        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp)
        ) {
            if (post.estadoModeracion == EstadoModeracion.EN_REVISION) {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                    Text(
                        text = "Esta publicación está pendiente de revisión por el moderador automático y solo la ves tú.",
                        modifier = Modifier.padding(12.dp),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onErrorContainer
                    )
                }
                Spacer(modifier = Modifier.height(12.dp))
            }

            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Person, contentDescription = null, tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
                Spacer(modifier = Modifier.width(6.dp))
                Text(text = post.autorNombre, style = MaterialTheme.typography.titleSmall)
                if (post.autorVerificado) {
                    Spacer(modifier = Modifier.width(4.dp))
                    Icon(Icons.Filled.CheckCircle, contentDescription = "Identidad verificada", tint = MaterialTheme.colorScheme.primary)
                }
            }
            Spacer(modifier = Modifier.height(4.dp))
            Text(text = post.programa.nombre, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
            Spacer(modifier = Modifier.height(12.dp))
            Text(text = post.titulo, style = MaterialTheme.typography.headlineSmall)
            Spacer(modifier = Modifier.height(8.dp))
            Text(text = post.contenido, style = MaterialTheme.typography.bodyLarge)

            Spacer(modifier = Modifier.height(20.dp))
            HorizontalDivider()
            Spacer(modifier = Modifier.height(12.dp))
            Text(text = "Respuestas (${post.comentarios.size})", style = MaterialTheme.typography.titleMedium)
            Spacer(modifier = Modifier.height(8.dp))

            if (post.comentarios.isEmpty()) {
                Text(
                    text = "Aún no hay respuestas. Sé el primero en comentar.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                )
            } else {
                post.comentarios.forEach { comentario ->
                    TarjetaComentario(comentario, modifier = Modifier.padding(vertical = 6.dp))
                }
            }
            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}

@Composable
private fun TarjetaComentario(comentario: ComentarioForo, modifier: Modifier = Modifier) {
    Card(modifier = modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(text = comentario.autorNombre, style = MaterialTheme.typography.labelLarge)
                if (comentario.autorVerificado) {
                    Spacer(modifier = Modifier.width(4.dp))
                    Icon(
                        Icons.Filled.CheckCircle,
                        contentDescription = "Identidad verificada",
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(top = 1.dp)
                    )
                }
                Spacer(modifier = Modifier.weight(1f, fill = true))
                Text(
                    text = tiempoRelativo(comentario.fecha),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
                )
            }
            Spacer(modifier = Modifier.height(4.dp))
            Text(text = comentario.contenido, style = MaterialTheme.typography.bodyMedium)
        }
    }
}
