package co.edu.upb.conecta.ui.theme

import androidx.compose.ui.graphics.Color

// Paleta inspirada en la identidad visual de las apps institucionales de la
// UPB (menú y login de UPB Digital): azul marino para texto/iconos, un
// degradado rosa→morado como acento de marca (logo, botones principales) y
// rojo para elementos de urgencia/emergencia. Son valores aproximados
// tomados a ojo de capturas de pantalla para este front preliminar — al
// tener el manual de marca oficial con los códigos exactos, reemplazar
// estos hex.
val UpbAzulMarino = Color(0xFF16215C)
val UpbAzulMarinoOscuro = Color(0xFF0C1440)
val UpbAzulMarinoClaro = Color(0xFF3B4A9E)

val UpbMoradoVivo = Color(0xFF7B2FF7)
val UpbMoradoClaro = Color(0xFF9B6BFF)
val UpbMoradoOscuro = Color(0xFF5A1FC9)
val UpbRosa = Color(0xFFE5006D)

// Contenedor muy claro del acento morado, para fondos de chips/tarjetas
// seleccionadas sobre superficie blanca.
val UpbMoradoContenedorClaro = Color(0xFFF1E9FE)

val UpbRojoInstitucional = Color(0xFFE2231A)

// Acento cálido secundario (categorías del mapa, detalles menores) — ya no
// es un color de marca principal, se mantiene por su función de categoría.
val UpbDorado = Color(0xFFD9A21B)
val UpbDoradoClaro = Color(0xFFF3E2B8)

val UpbFondoClaro = Color(0xFFFFFFFF)
val UpbSuperficieClara = Color(0xFFFFFFFF)
val UpbFondoOscuro = Color(0xFF0F1330)
val UpbSuperficieOscura = Color(0xFF1A1F45)

val UpbGrisTexto = UpbAzulMarino
val UpbGrisTextoClaro = Color(0xFFE7E8F5)

// Colores semánticos para urgencia de cierre (convocatorias / prácticas).
// El rojo de "urgente" es el mismo rojo institucional de emergencias.
val UrgenciaAlta = UpbRojoInstitucional
val UrgenciaMedia = Color(0xFFB8720A)
val UrgenciaBaja = Color(0xFF1E8E5A)

// Colores de apoyo para categorías (noticias, foro, mapa).
val AcentoAzul = Color(0xFF2D5C8A)
val AcentoVerde = Color(0xFF1E8E5A)
val AcentoMorado = UpbMoradoVivo
