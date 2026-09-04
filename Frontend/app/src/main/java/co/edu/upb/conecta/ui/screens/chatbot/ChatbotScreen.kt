package co.edu.upb.conecta.ui.screens.chatbot

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import co.edu.upb.conecta.data.repository.ChatbotRepository
import co.edu.upb.conecta.domain.model.ChatMessage
import java.util.UUID

/**
 * Chatbot de preguntas frecuentes. En este front preliminar responde con
 * coincidencias simples sobre [ChatbotRepository.obtenerPreguntasFrecuentes];
 * la respuesta real requeriría un servicio de NLP/backend, pero la UI ya
 * queda lista para conectarse a él.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatbotScreen(
    chatbotRepository: ChatbotRepository,
    onVolver: () -> Unit,
    modifier: Modifier = Modifier
) {
    val preguntasFrecuentes = remember { chatbotRepository.obtenerPreguntasFrecuentes() }
    val mensajes = remember {
        mutableStateListOf(
            ChatMessage(
                id = UUID.randomUUID().toString(),
                texto = "Hola, soy el asistente de UPB Conecta. Puedes preguntarme sobre convocatorias, prácticas, el foro o el mapa del campus. También puedes tocar una de las preguntas frecuentes de abajo.",
                esUsuario = false
            )
        )
    }
    var textoEntrada by remember { mutableStateOf("") }
    val listState = rememberLazyListState()

    fun enviar(texto: String) {
        if (texto.isBlank()) return
        mensajes.add(ChatMessage(UUID.randomUUID().toString(), texto, esUsuario = true))
        val respuesta = chatbotRepository.responder(texto)
        mensajes.add(ChatMessage(UUID.randomUUID().toString(), respuesta, esUsuario = false))
        textoEntrada = ""
    }

    LaunchedEffect(mensajes.size) {
        if (mensajes.isNotEmpty()) listState.animateScrollToItem(mensajes.size - 1)
    }

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = { Text("Chatbot · preguntas frecuentes") },
                navigationIcon = {
                    IconButton(onClick = onVolver) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Volver")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
        ) {
            LazyColumn(
                state = listState,
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                contentPadding = PaddingValues(12.dp)
            ) {
                items(mensajes, key = { it.id }) { mensaje ->
                    BurbujaMensaje(mensaje, modifier = Modifier.padding(vertical = 4.dp))
                }
                if (mensajes.size <= 1) {
                    item {
                        Column(modifier = Modifier.padding(top = 8.dp)) {
                            Text(
                                text = "Preguntas frecuentes",
                                style = MaterialTheme.typography.labelLarge,
                                modifier = Modifier.padding(bottom = 8.dp)
                            )
                            preguntasFrecuentes.forEach { faq ->
                                SuggestionChip(
                                    onClick = { enviar(faq.pregunta) },
                                    label = { Text(faq.pregunta) },
                                    modifier = Modifier.padding(bottom = 6.dp)
                                )
                            }
                        }
                    }
                }
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .imePadding()
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedTextField(
                    value = textoEntrada,
                    onValueChange = { textoEntrada = it },
                    modifier = Modifier.weight(1f),
                    placeholder = { Text("Escribe tu pregunta…") },
                    singleLine = true
                )
                IconButton(onClick = { enviar(textoEntrada) }) {
                    Icon(Icons.Filled.Send, contentDescription = "Enviar")
                }
            }
        }
    }
}

@Composable
private fun BurbujaMensaje(mensaje: ChatMessage, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = if (mensaje.esUsuario) Arrangement.End else Arrangement.Start
    ) {
        Card(
            modifier = Modifier.widthIn(max = 280.dp),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(
                containerColor = if (mensaje.esUsuario) MaterialTheme.colorScheme.primary
                else MaterialTheme.colorScheme.surfaceVariant
            )
        ) {
            Text(
                text = mensaje.texto,
                modifier = Modifier.padding(12.dp),
                style = MaterialTheme.typography.bodyMedium,
                color = if (mensaje.esUsuario) MaterialTheme.colorScheme.onPrimary
                else MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
