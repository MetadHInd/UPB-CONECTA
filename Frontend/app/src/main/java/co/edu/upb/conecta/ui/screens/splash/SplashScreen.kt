package co.edu.upb.conecta.ui.screens.splash

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import co.edu.upb.conecta.ui.theme.UpbGradienteMarca
import kotlinx.coroutines.delay

/**
 * Pantalla de bienvenida (splash) mostrada al abrir la app: el logotipo de
 * texto "UPB Conecta" con el degradado de marca. Es la primera ruta del
 * NavHost — no tiene barra superior ni inferior (no está en
 * `rutasConBarraInferior`) — y avanza sola a Login tras una pausa breve.
 *
 * Nota: en Android 12+ el sistema operativo sigue mostrando brevemente el
 * ícono de lanzador (`res/drawable/ic_launcher_foreground.xml`) como splash
 * nativo durante el primer instante, antes de que este Composable alcance a
 * dibujarse — eso no lo controla el código de la app.
 */
@Composable
fun SplashScreen(onTerminar: () -> Unit) {
    LaunchedEffect(Unit) {
        delay(1100)
        onTerminar()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = "UPB",
                fontSize = 44.sp,
                fontWeight = FontWeight.ExtraBold,
                style = TextStyle(brush = UpbGradienteMarca)
            )
            Text(
                text = "Conecta",
                fontSize = 22.sp,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.onSurface
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "Universidad Pontificia Bolivariana",
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = 32.dp)
            )
        }
    }
}
