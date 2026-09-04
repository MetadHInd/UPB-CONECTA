package co.edu.upb.conecta.ui.screens.foro

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.HourglassEmpty
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import co.edu.upb.conecta.data.repository.ForoRepository
import co.edu.upb.conecta.domain.model.EstadoModeracion
import co.edu.upb.conecta.domain.model.PostForo
import co.edu.upb.conecta.ui.components.EncabezadoSeccion
import co.edu.upb.conecta.ui.theme.UrgenciaMedia
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale

/**
 * Foro estudiantil. La identidad verificada ([PostForo.autorVerificado]) y
 * el estado de moderación automática ([EstadoModeracion]) son las dos
 * garantías del RF de "foro con identidad verificada y moderación
 * automática": aquí se muestran de forma visible en cada publicación.
 */
@Composable
fun ForoScreen(
    foroRepository: ForoRepository,
    onAbrirPost: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val posts = remember { foroRepository.obtenerPosts() }
    val visibles = remember(posts) { posts.filter { it.estadoModeracion != EstadoModeracion.OCULTO_AUTOMATICAMENTE } }

    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 24.dp)
    ) {
        item {
            EncabezadoSeccion(
                titulo = "Foro estudiantil",
                subtitulo = "Identidad verificada institucionalmente · moderación automática"
            )
        }
        items(visibles, key = { it.id }) { post ->
            TarjetaPost(
                post = post,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 6.dp),
                onClick = { onAbrirPost(post.id) }
            )
        }
    }
}

private val formatoRelativo = DateTimeFormatter.ofPattern("d MMM, h:mm a", Locale("es", "CO"))

fun tiempoRelativo(fecha: java.time.LocalDateTime): String {
    val ahora = java.time.LocalDateTime.now()
    val minutos = ChronoUnit.MINUTES.between(fecha, ahora)
    return when {
        minutos < 1 -> "justo ahora"
        minutos < 60 -> "hace ${minutos} min"
        minutos < 60 * 24 -> "hace ${minutos / 60} h"
        else -> fecha.format(formatoRelativo)
    }
}

@Composable
fun TarjetaPost(post: PostForo, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Card(modifier = modifier, onClick = onClick) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Filled.Person,
                    contentDescription = null,
                    modifier = Modifier.padding(end = 4.dp),
                    tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
                )
                Text(
                    text = post.autorNombre,
                    style = MaterialTheme.typography.labelLarge,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                if (post.autorVerificado) {
                    Icon(
                        Icons.Filled.CheckCircle,
                        contentDescription = "Identidad verificada",
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(start = 4.dp)
                    )
                }
                Spacer(modifier = Modifier.weight(1f, fill = true))
                Text(
                    text = tiempoRelativo(post.fecha),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
                )
            }
            Spacer(modifier = Modifier.height(8.dp))
            Text(text = post.titulo, style = MaterialTheme.typography.titleMedium)
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = post.contenido,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.8f)
            )
            Spacer(modifier = Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = post.programa.nombre,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary
                )
                Spacer(modifier = Modifier.weight(1f, fill = true))
                if (post.estadoModeracion == EstadoModeracion.EN_REVISION) {
                    InsigniaModeracion()
                    Spacer(modifier = Modifier.width(8.dp))
                }
                Icon(Icons.Filled.Favorite, contentDescription = null, modifier = Modifier.padding(end = 2.dp), tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
                Text(text = "${post.likes}", style = MaterialTheme.typography.labelSmall)
                Spacer(modifier = Modifier.width(8.dp))
                Text(text = "${post.comentarios.size} respuestas", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
            }
        }
    }
}

@Composable
fun InsigniaModeracion(modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(50),
        color = UrgenciaMedia.copy(alpha = 0.15f),
        contentColor = UrgenciaMedia
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Filled.HourglassEmpty, contentDescription = null, modifier = Modifier.padding(end = 4.dp))
            Text(text = "En revisión", fontSize = 11.sp)
        }
    }
}
