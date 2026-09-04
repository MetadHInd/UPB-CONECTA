package co.edu.upb.conecta.ui.screens.mapa

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import co.edu.upb.conecta.data.repository.MapaRepository
import co.edu.upb.conecta.domain.model.CategoriaPunto
import co.edu.upb.conecta.domain.model.PuntoInteres
import co.edu.upb.conecta.ui.components.EncabezadoSeccion
import co.edu.upb.conecta.ui.theme.AcentoAzul
import co.edu.upb.conecta.ui.theme.AcentoMorado
import co.edu.upb.conecta.ui.theme.AcentoVerde
import co.edu.upb.conecta.ui.theme.UpbDorado
import co.edu.upb.conecta.ui.theme.UpbAzulMarino
import kotlin.math.roundToInt

/**
 * Mapa del campus — versión preliminar. En lugar de integrar un SDK de
 * mapas real (que requeriría una API key y un plano georreferenciado que
 * la Universidad aún no ha entregado), se dibuja un plano esquemático con
 * los puntos de interés ubicados por coordenadas relativas. El modelo
 * [PuntoInteres] ya está listo para mapearse a coordenadas geográficas
 * reales sin cambiar la capa de dominio.
 */
@Composable
fun MapaScreen(mapaRepository: MapaRepository, modifier: Modifier = Modifier) {
    val puntos = remember { mapaRepository.obtenerPuntosDeInteres() }
    var puntoSeleccionado by remember { mutableStateOf<PuntoInteres?>(puntos.firstOrNull()) }

    LazyColumn(modifier = modifier.fillMaxSize()) {
        item {
            EncabezadoSeccion(
                titulo = "Mapa del campus",
                subtitulo = "Toca un punto para ver el detalle — plano esquemático preliminar"
            )
        }

        item {
            PlanoEsquematico(
                puntos = puntos,
                seleccionado = puntoSeleccionado,
                onSeleccionar = { puntoSeleccionado = it },
                modifier = Modifier
                    .padding(horizontal = 16.dp)
                    .fillMaxWidth()
            )
        }

        puntoSeleccionado?.let { punto ->
            item {
                TarjetaPuntoSeleccionado(punto, modifier = Modifier.padding(16.dp))
            }
        }

        item {
            Text(
                text = "Todos los puntos",
                style = MaterialTheme.typography.titleSmall,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
            )
        }

        items(puntos, key = { it.id }) { punto ->
            FilaPunto(
                punto = punto,
                seleccionado = punto.id == puntoSeleccionado?.id,
                onClick = { puntoSeleccionado = punto },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 4.dp)
            )
        }

        item { Box(modifier = Modifier.height(16.dp)) }
    }
}

private fun colorCategoriaPunto(categoria: CategoriaPunto): Color = when (categoria) {
    CategoriaPunto.BLOQUE_ACADEMICO -> UpbAzulMarino
    CategoriaPunto.BIBLIOTECA -> AcentoAzul
    CategoriaPunto.BIENESTAR -> AcentoMorado
    CategoriaPunto.COORDINACION -> UpbAzulMarino
    CategoriaPunto.SERVICIOS -> UpbDorado
    CategoriaPunto.DEPORTES -> AcentoVerde
    CategoriaPunto.PARQUEADERO -> Color(0xFF616161)
}

@Composable
private fun PlanoEsquematico(
    puntos: List<PuntoInteres>,
    seleccionado: PuntoInteres?,
    onSeleccionar: (PuntoInteres) -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier
            .aspectRatio(1f)
            .border(
                width = 1.dp,
                color = MaterialTheme.colorScheme.outlineVariant,
                shape = RoundedCornerShape(16.dp)
            ),
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f)
    ) {
        BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
            val anchoPx = constraints.maxWidth.toFloat()
            val altoPx = constraints.maxHeight.toFloat()

            Canvas(modifier = Modifier.fillMaxSize()) {
                // Senderos esquemáticos, solo de referencia visual.
                drawLine(
                    color = Color.Gray.copy(alpha = 0.3f),
                    start = Offset(size.width * 0.1f, size.height * 0.5f),
                    end = Offset(size.width * 0.9f, size.height * 0.5f),
                    strokeWidth = 6f,
                    cap = StrokeCap.Round
                )
                drawLine(
                    color = Color.Gray.copy(alpha = 0.3f),
                    start = Offset(size.width * 0.5f, size.height * 0.1f),
                    end = Offset(size.width * 0.5f, size.height * 0.9f),
                    strokeWidth = 6f,
                    cap = StrokeCap.Round
                )
            }

            puntos.forEach { punto ->
                Marcador(
                    punto = punto,
                    seleccionado = punto.id == seleccionado?.id,
                    anchoPx = anchoPx,
                    altoPx = altoPx,
                    onClick = { onSeleccionar(punto) }
                )
            }
        }
    }
}

@Composable
private fun Marcador(
    punto: PuntoInteres,
    seleccionado: Boolean,
    anchoPx: Float,
    altoPx: Float,
    onClick: () -> Unit
) {
    val density = LocalDensity.current
    val tamanoDp = if (seleccionado) 22.dp else 16.dp
    val tamanoPx = with(density) { tamanoDp.toPx() }
    val color = colorCategoriaPunto(punto.categoria)

    Box(
        modifier = Modifier
            .offset {
                IntOffset(
                    x = (anchoPx * punto.x - tamanoPx / 2f).roundToInt(),
                    y = (altoPx * punto.y - tamanoPx / 2f).roundToInt()
                )
            }
            .size(tamanoDp)
            .clip(CircleShape)
            .background(color)
            .border(
                width = if (seleccionado) 2.dp else 0.dp,
                color = Color.White,
                shape = CircleShape
            )
            .clickable(onClick = onClick)
    )
}

@Composable
private fun TarjetaPuntoSeleccionado(punto: PuntoInteres, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Text(
                text = punto.categoria.etiqueta,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.7f)
            )
            Text(text = punto.nombre, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onPrimaryContainer)
            Text(text = punto.descripcion, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onPrimaryContainer)
        }
    }
}

@Composable
private fun FilaPunto(
    punto: PuntoInteres,
    seleccionado: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(12.dp),
        color = if (seleccionado) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        onClick = onClick
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(12.dp)
                    .clip(CircleShape)
                    .background(colorCategoriaPunto(punto.categoria))
            )
            Column {
                Text(text = punto.nombre, style = MaterialTheme.typography.titleSmall)
                Text(
                    text = punto.categoria.etiqueta,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                )
            }
        }
    }
}
