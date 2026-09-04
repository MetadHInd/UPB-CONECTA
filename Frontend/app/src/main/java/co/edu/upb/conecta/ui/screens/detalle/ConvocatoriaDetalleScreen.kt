package co.edu.upb.conecta.ui.screens.detalle

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import co.edu.upb.conecta.data.repository.ConvocatoriasRepository
import co.edu.upb.conecta.ui.components.ChipPrograma
import co.edu.upb.conecta.ui.components.EstadoVacio
import co.edu.upb.conecta.ui.components.InsigniaUrgencia
import java.time.format.DateTimeFormatter
import java.util.Locale

private val formatoFechaLarga = DateTimeFormatter.ofPattern("d 'de' MMMM 'de' yyyy", Locale("es", "CO"))

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConvocatoriaDetalleScreen(
    id: String,
    convocatoriasRepository: ConvocatoriasRepository,
    onVolver: () -> Unit,
    modifier: Modifier = Modifier
) {
    val convocatoria = remember(id) { convocatoriasRepository.obtenerPorId(id) }

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = { Text("Convocatoria") },
                navigationIcon = {
                    IconButton(onClick = onVolver) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Volver")
                    }
                }
            )
        }
    ) { padding ->
        if (convocatoria == null) {
            EstadoVacio("No se encontró la convocatoria.", modifier = Modifier.padding(padding))
            return@Scaffold
        }

        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = convocatoria.categoria.etiqueta,
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary
                )
                InsigniaUrgencia(convocatoria.diasParaCierre())
            }
            Spacer(modifier = Modifier.height(8.dp))
            Text(text = convocatoria.titulo, style = MaterialTheme.typography.headlineSmall)
            Spacer(modifier = Modifier.height(16.dp))

            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                Column(modifier = Modifier.padding(12.dp)) {
                    FilaDato("Fecha de cierre", convocatoria.fechaCierre.format(formatoFechaLarga))
                    FilaDato("Publicada", convocatoria.fechaPublicacion.format(formatoFechaLarga))
                    FilaDato("Fuente original", convocatoria.fuenteOriginal)
                    FilaDato("Responsable", convocatoria.coordinacionResponsable)
                }
            }

            Spacer(modifier = Modifier.height(16.dp))
            Text(text = "Descripción", style = MaterialTheme.typography.titleMedium)
            Spacer(modifier = Modifier.height(4.dp))
            Text(text = convocatoria.descripcion, style = MaterialTheme.typography.bodyLarge)

            Spacer(modifier = Modifier.height(16.dp))
            Text(text = "Dirigida a", style = MaterialTheme.typography.titleMedium)
            Spacer(modifier = Modifier.height(6.dp))
            if (convocatoria.esParaTodos) {
                ChipPrograma("Toda la comunidad universitaria")
            } else {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    convocatoria.programas.forEach { ChipPrograma(it.nombre) }
                }
            }
            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}

@Composable
private fun FilaDato(etiqueta: String, valor: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(text = etiqueta, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(text = valor, style = MaterialTheme.typography.bodyMedium)
    }
}
