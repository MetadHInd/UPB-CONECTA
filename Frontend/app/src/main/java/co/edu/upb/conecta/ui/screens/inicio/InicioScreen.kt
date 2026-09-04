package co.edu.upb.conecta.ui.screens.inicio

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import co.edu.upb.conecta.data.repository.ConvocatoriasRepository
import co.edu.upb.conecta.data.repository.PracticasRepository
import co.edu.upb.conecta.domain.model.Convocatoria
import co.edu.upb.conecta.domain.model.MockProgramas
import co.edu.upb.conecta.domain.model.Practica
import co.edu.upb.conecta.domain.model.Programa
import co.edu.upb.conecta.ui.components.ChipPrograma
import co.edu.upb.conecta.ui.components.EstadoVacio
import co.edu.upb.conecta.ui.components.InsigniaUrgencia

@Composable
fun InicioScreen(
    convocatoriasRepository: ConvocatoriasRepository,
    practicasRepository: PracticasRepository,
    onAbrirConvocatoria: (String) -> Unit,
    onAbrirPractica: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val convocatorias = remember { convocatoriasRepository.obtenerTodas() }
    val practicas = remember { practicasRepository.obtenerTodas() }

    var pestanaSeleccionada by remember { mutableStateOf(0) }
    var programaSeleccionado by remember { mutableStateOf(MockProgramas.TODOS) }

    val convocatoriasFiltradas = remember(convocatorias, programaSeleccionado) {
        convocatorias.filter { conv ->
            programaSeleccionado == MockProgramas.TODOS || conv.esParaTodos ||
                conv.programas.any { it.id == programaSeleccionado.id }
        }
    }
    val practicasFiltradas = remember(practicas, programaSeleccionado) {
        practicas.filter { prac ->
            programaSeleccionado == MockProgramas.TODOS ||
                prac.programasDestino.any { it.id == programaSeleccionado.id }
        }
    }

    Column(modifier = modifier.fillMaxSize()) {
        FiltroProgramas(
            seleccionado = programaSeleccionado,
            onSeleccionar = { programaSeleccionado = it }
        )

        TabRow(selectedTabIndex = pestanaSeleccionada) {
            Tab(
                selected = pestanaSeleccionada == 0,
                onClick = { pestanaSeleccionada = 0 },
                text = { Text("Convocatorias (${convocatoriasFiltradas.size})") }
            )
            Tab(
                selected = pestanaSeleccionada == 1,
                onClick = { pestanaSeleccionada = 1 },
                text = { Text("Prácticas (${practicasFiltradas.size})") }
            )
        }

        if (pestanaSeleccionada == 0) {
            if (convocatoriasFiltradas.isEmpty()) {
                EstadoVacio("No hay convocatorias para este programa por ahora.")
            } else {
                LazyColumn(contentPadding = PaddingValues(vertical = 8.dp, horizontal = 16.dp)) {
                    items(convocatoriasFiltradas, key = { it.id }) { conv ->
                        TarjetaConvocatoria(
                            convocatoria = conv,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 6.dp),
                            onClick = { onAbrirConvocatoria(conv.id) }
                        )
                    }
                }
            }
        } else {
            if (practicasFiltradas.isEmpty()) {
                EstadoVacio("No hay ofertas de práctica para este programa por ahora.")
            } else {
                LazyColumn(contentPadding = PaddingValues(vertical = 8.dp, horizontal = 16.dp)) {
                    items(practicasFiltradas, key = { it.id }) { prac ->
                        TarjetaPractica(
                            practica = prac,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 6.dp),
                            onClick = { onAbrirPractica(prac.id) }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun FiltroProgramas(
    seleccionado: Programa,
    onSeleccionar: (Programa) -> Unit
) {
    val opciones = remember { listOf(MockProgramas.TODOS) + MockProgramas.todos }
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        items(opciones, key = { it.id }) { programa ->
            FilterChip(
                selected = seleccionado.id == programa.id,
                onClick = { onSeleccionar(programa) },
                label = {
                    Text(
                        text = programa.nombre,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                },
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = MaterialTheme.colorScheme.primary,
                    selectedLabelColor = MaterialTheme.colorScheme.onPrimary
                )
            )
        }
    }
}

@Composable
private fun TarjetaConvocatoria(
    convocatoria: Convocatoria,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Card(modifier = modifier, onClick = onClick) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = convocatoria.categoria.etiqueta,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary
                )
                InsigniaUrgencia(convocatoria.diasParaCierre())
            }
            Spacer(modifier = Modifier.height(6.dp))
            Text(text = convocatoria.titulo, style = MaterialTheme.typography.titleMedium)
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = convocatoria.descripcion,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.75f)
            )
            Spacer(modifier = Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                if (convocatoria.esParaTodos) {
                    ChipPrograma("Toda la comunidad")
                } else {
                    convocatoria.programas.take(2).forEach { ChipPrograma(it.nombre) }
                    if (convocatoria.programas.size > 2) {
                        Text(
                            "+${convocatoria.programas.size - 2}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun TarjetaPractica(
    practica: Practica,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Card(modifier = modifier, onClick = onClick) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = practica.modalidad.etiqueta,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary
                )
                InsigniaUrgencia(practica.diasParaCierre())
            }
            Spacer(modifier = Modifier.height(6.dp))
            Text(text = practica.cargo, style = MaterialTheme.typography.titleMedium)
            Text(
                text = practica.empresa,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.75f)
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = practica.ubicacion,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
            )
            Spacer(modifier = Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                practica.programasDestino.take(2).forEach { ChipPrograma(it.nombre) }
            }
        }
    }
}
