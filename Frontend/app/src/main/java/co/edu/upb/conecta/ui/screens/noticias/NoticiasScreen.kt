package co.edu.upb.conecta.ui.screens.noticias

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Event
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.SportsSoccer
import androidx.compose.material.icons.filled.ThumbUp
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import co.edu.upb.conecta.data.repository.NoticiasRepository
import co.edu.upb.conecta.domain.model.CategoriaNoticia
import co.edu.upb.conecta.domain.model.Noticia
import co.edu.upb.conecta.ui.components.EncabezadoSeccion
import co.edu.upb.conecta.ui.theme.AcentoAzul
import co.edu.upb.conecta.ui.theme.AcentoMorado
import co.edu.upb.conecta.ui.theme.AcentoVerde
import co.edu.upb.conecta.ui.theme.UrgenciaMedia
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/**
 * Apartado de noticias con scrolling — carrusel horizontal de destacadas
 * arriba y debajo el listado cronológico completo en una columna vertical
 * desplazable (LazyColumn). Las tarjetas del listado imitan el formato de
 * una publicación de red social (imagen con etiqueta de categoría y titular
 * superpuesto, autor/fuente con avatar, e interacciones tipo me gusta /
 * comentar / compartir) para que se sientan como contenido que se sigue,
 * no como un boletín plano.
 */
@Composable
fun NoticiasScreen(noticiasRepository: NoticiasRepository, modifier: Modifier = Modifier) {
    val noticias = remember { noticiasRepository.obtenerTodas() }
    val destacadas = remember(noticias) { noticias.filter { it.destacada } }

    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 24.dp)
    ) {
        item {
            EncabezadoSeccion(
                titulo = "Noticias UPB Bucaramanga",
                subtitulo = "${noticias.size} publicaciones — desliza para ver más"
            )
        }

        if (destacadas.isNotEmpty()) {
            item {
                Text(
                    text = "Destacadas",
                    style = MaterialTheme.typography.titleSmall,
                    modifier = Modifier.padding(start = 16.dp, bottom = 8.dp)
                )
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(destacadas, key = { "destacada-${it.id}" }) { noticia ->
                        TarjetaNoticiaDestacada(noticia)
                    }
                }
                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    text = "Todas",
                    style = MaterialTheme.typography.titleSmall,
                    modifier = Modifier.padding(start = 16.dp, bottom = 4.dp)
                )
            }
        }

        items(noticias, key = { it.id }) { noticia ->
            TarjetaNoticia(noticia, modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp))
        }
    }
}

private fun colorCategoria(categoria: CategoriaNoticia): Color = when (categoria) {
    CategoriaNoticia.INSTITUCIONAL -> AcentoAzul
    CategoriaNoticia.EVENTO -> UrgenciaMedia
    CategoriaNoticia.LOGRO -> AcentoVerde
    CategoriaNoticia.BIENESTAR -> AcentoMorado
    CategoriaNoticia.CULTURA -> AcentoAzul
}

private fun iconoCategoria(categoria: CategoriaNoticia): ImageVector = when (categoria) {
    CategoriaNoticia.INSTITUCIONAL -> Icons.Filled.Campaign
    CategoriaNoticia.EVENTO -> Icons.Filled.Event
    CategoriaNoticia.LOGRO -> Icons.Filled.EmojiEvents
    CategoriaNoticia.BIENESTAR -> Icons.Filled.Favorite
    CategoriaNoticia.CULTURA -> Icons.Filled.SportsSoccer
}

/** "HOY" / "HACE 1 DÍA" / "HACE N DÍAS", al estilo de un pie de publicación. */
private fun tiempoRelativoNoticia(fecha: LocalDate): String {
    val dias = ChronoUnit.DAYS.between(fecha, LocalDate.now())
    return when {
        dias <= 0 -> "HOY"
        dias == 1L -> "HACE 1 DÍA"
        else -> "HACE $dias DÍAS"
    }
}

/**
 * Imagen "de portada" simulada (no hay fotos reales todavía): un bloque de
 * color por categoría con un ícono grande de marca de agua, para que la
 * tarjeta no se vea vacía mientras no hay backend de medios.
 */
@Composable
private fun ImagenNoticia(categoria: CategoriaNoticia, alto: androidx.compose.ui.unit.Dp, modifier: Modifier = Modifier) {
    val color = colorCategoria(categoria)
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(alto)
            .background(
                Brush.verticalGradient(listOf(color.copy(alpha = 0.55f), color.copy(alpha = 0.85f)))
            ),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            imageVector = iconoCategoria(categoria),
            contentDescription = null,
            tint = Color.White.copy(alpha = 0.25f),
            modifier = Modifier.size(alto / 2)
        )
    }
}

@Composable
private fun EtiquetaCategoria(categoria: CategoriaNoticia, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(topStart = 4.dp, bottomEnd = 10.dp, topEnd = 4.dp, bottomStart = 4.dp),
        color = colorCategoria(categoria)
    ) {
        Text(
            text = categoria.etiqueta.uppercase(),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.5.sp,
            color = Color.White,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp)
        )
    }
}

@Composable
private fun AvatarFuente(categoria: CategoriaNoticia, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .size(36.dp)
            .background(colorCategoria(categoria), CircleShape),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = "U",
            color = Color.White,
            fontWeight = FontWeight.Bold,
            fontSize = 15.sp
        )
    }
}

@Composable
private fun FilaInteracciones(likes: Int, comentarios: Int, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(20.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Icon(
                Icons.Filled.ThumbUp,
                contentDescription = "Me gusta",
                modifier = Modifier.size(16.dp),
                tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.55f)
            )
            Text(text = "$likes", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Icon(
                Icons.Filled.ChatBubbleOutline,
                contentDescription = "Comentarios",
                modifier = Modifier.size(16.dp),
                tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.55f)
            )
            Text(text = "$comentarios", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
        }
        Spacer(modifier = Modifier.width(0.dp))
        Icon(
            Icons.Filled.Share,
            contentDescription = "Compartir",
            modifier = Modifier.size(16.dp),
            tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.55f)
        )
    }
}

/**
 * Tarjeta principal del listado — imagen con etiqueta de categoría y
 * titular superpuestos (con velo degradado para que el texto blanco se lea
 * sobre cualquier color), y debajo la fila de autor/fuente + interacciones,
 * al estilo de una publicación de una página institucional en redes.
 */
@Composable
private fun TarjetaNoticia(noticia: Noticia, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column {
            Box(modifier = Modifier.fillMaxWidth()) {
                ImagenNoticia(categoria = noticia.categoria, alto = 170.dp)

                EtiquetaCategoria(
                    categoria = noticia.categoria,
                    modifier = Modifier.align(Alignment.TopStart)
                )

                // Velo degradado inferior para que el titular blanco
                // siempre contraste, sin importar el color de fondo.
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .fillMaxWidth()
                        .height(90.dp)
                        .background(
                            Brush.verticalGradient(
                                listOf(Color.Transparent, Color.Black.copy(alpha = 0.75f))
                            )
                        )
                )
                Text(
                    text = noticia.titulo,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .padding(horizontal = 12.dp, vertical = 10.dp)
                )
            }

            Column(modifier = Modifier.padding(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    AvatarFuente(categoria = noticia.categoria)
                    Spacer(modifier = Modifier.width(8.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = noticia.fuente,
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Text(
                            text = tiempoRelativoNoticia(noticia.fechaPublicacion),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
                        )
                    }
                }
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = noticia.resumen,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.85f),
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(modifier = Modifier.height(10.dp))
                FilaInteracciones(likes = noticia.likes, comentarios = noticia.comentarios)
            }
        }
    }
}

/** Versión compacta para el carrusel horizontal de "Destacadas". */
@Composable
private fun TarjetaNoticiaDestacada(noticia: Noticia) {
    Card(
        modifier = Modifier.width(240.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column {
            Box(modifier = Modifier.fillMaxWidth()) {
                ImagenNoticia(categoria = noticia.categoria, alto = 110.dp)
                EtiquetaCategoria(categoria = noticia.categoria, modifier = Modifier.align(Alignment.TopStart))
            }
            Column(modifier = Modifier.padding(10.dp)) {
                Text(
                    text = noticia.titulo,
                    style = MaterialTheme.typography.titleSmall,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = tiempoRelativoNoticia(noticia.fechaPublicacion),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
                )
            }
        }
    }
}
