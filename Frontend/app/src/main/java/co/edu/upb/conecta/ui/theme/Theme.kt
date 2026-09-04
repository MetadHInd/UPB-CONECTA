package co.edu.upb.conecta.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

/**
 * Degradado rosa→morado de marca (ver logo "UPB" en las apps institucionales).
 * Se usa puntualmente: el nombre de la app en la barra superior y el botón
 * flotante del chatbot — no en componentes de Material3 que solo aceptan un
 * [Color] sólido (Card, Button, TopAppBar, etc.), donde se usa [UpbMoradoVivo].
 */
val UpbGradienteMarca = Brush.horizontalGradient(listOf(UpbRosa, UpbMoradoVivo))

private val LightColors = lightColorScheme(
    primary = UpbMoradoVivo,
    onPrimary = Color.White,
    primaryContainer = UpbMoradoContenedorClaro,
    onPrimaryContainer = UpbMoradoOscuro,
    secondary = UpbAzulMarino,
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFE7E9F7),
    onSecondaryContainer = UpbAzulMarino,
    background = UpbFondoClaro,
    onBackground = UpbGrisTexto,
    surface = UpbSuperficieClara,
    onSurface = UpbGrisTexto,
    surfaceVariant = Color(0xFFF1F1F8),
    onSurfaceVariant = UpbAzulMarino,
    outlineVariant = Color(0xFFDADCE8),
    error = UrgenciaAlta
)

private val DarkColors = darkColorScheme(
    primary = UpbMoradoClaro,
    onPrimary = UpbAzulMarinoOscuro,
    primaryContainer = UpbMoradoOscuro,
    onPrimaryContainer = Color(0xFFEDE0FF),
    secondary = Color(0xFFB9C3FF),
    onSecondary = UpbAzulMarinoOscuro,
    background = UpbFondoOscuro,
    onBackground = UpbGrisTextoClaro,
    surface = UpbSuperficieOscura,
    onSurface = UpbGrisTextoClaro,
    surfaceVariant = UpbAzulMarinoOscuro,
    error = Color(0xFFFF8A80)
)

@Composable
fun UPBConectaTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColors else LightColors
    MaterialTheme(
        colorScheme = colorScheme,
        typography = UpbTypography,
        content = content
    )
}
