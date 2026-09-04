package co.edu.upb.conecta.ui.screens.perfil

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.School
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import co.edu.upb.conecta.data.repository.UsuarioRepository
import co.edu.upb.conecta.ui.components.EncabezadoSeccion

@Composable
fun PerfilScreen(
    usuarioRepository: UsuarioRepository,
    onCerrarSesion: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    val usuario = remember { usuarioRepository.obtenerUsuarioActual() }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(bottom = 24.dp)
    ) {
        EncabezadoSeccion(titulo = "Perfil")

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Box(
                modifier = Modifier
                    .size(84.dp)
                    .background(MaterialTheme.colorScheme.primary, CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = usuario.nombre.trim().split(" ").take(2).mapNotNull { it.firstOrNull() }
                        .joinToString("").uppercase(),
                    color = MaterialTheme.colorScheme.onPrimary,
                    fontSize = 28.sp,
                    fontWeight = FontWeight.Bold
                )
            }
            Spacer(modifier = Modifier.height(12.dp))
            Text(text = usuario.nombre, style = MaterialTheme.typography.titleLarge)
            Spacer(modifier = Modifier.height(4.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = usuario.programa.nombre,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                )
                if (usuario.identidadVerificada) {
                    Spacer(modifier = Modifier.padding(start = 4.dp))
                    Icon(
                        Icons.Filled.CheckCircle,
                        contentDescription = "Identidad verificada",
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(16.dp)
                    )
                }
            }
            Spacer(modifier = Modifier.height(20.dp))

            Card(modifier = Modifier.fillMaxWidth()) {
                Column {
                    FilaInfo(Icons.Filled.Email, "Correo institucional", usuario.correoInstitucional)
                    FilaInfo(Icons.Filled.School, "Semestre", "${usuario.semestre}.º semestre")
                    FilaInfo(
                        Icons.Filled.CheckCircle,
                        "Identidad institucional",
                        if (usuario.identidadVerificada) "Verificada" else "Sin verificar"
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            Card(modifier = Modifier.fillMaxWidth()) {
                Column {
                    FilaAccion(Icons.Filled.MenuBook, "Preguntas frecuentes")
                    FilaAccion(Icons.Filled.Info, "Acerca de UPB Conecta")
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            Card(modifier = Modifier.fillMaxWidth()) {
                FilaAccion(
                    icono = Icons.Filled.Logout,
                    etiqueta = "Cerrar sesión",
                    onClick = onCerrarSesion,
                    colorAcento = MaterialTheme.colorScheme.error
                )
            }

            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = "Front preliminar · datos de ejemplo",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.4f)
            )
        }
    }
}

@Composable
private fun FilaInfo(icono: androidx.compose.ui.graphics.vector.ImageVector, etiqueta: String, valor: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(icono, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
        Spacer(modifier = Modifier.padding(start = 10.dp))
        Column {
            Text(text = etiqueta, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
            Text(text = valor, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun FilaAccion(
    icono: androidx.compose.ui.graphics.vector.ImageVector,
    etiqueta: String,
    onClick: () -> Unit = {},
    colorAcento: androidx.compose.ui.graphics.Color = MaterialTheme.colorScheme.primary
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(icono, contentDescription = null, tint = colorAcento)
            Spacer(modifier = Modifier.padding(start = 10.dp))
            Text(text = etiqueta, style = MaterialTheme.typography.bodyLarge, color = colorAcento)
        }
        Icon(
            Icons.Filled.ChevronRight,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.4f)
        )
    }
}
