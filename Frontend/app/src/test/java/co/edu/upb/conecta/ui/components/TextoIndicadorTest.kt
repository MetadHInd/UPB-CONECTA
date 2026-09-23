package co.edu.upb.conecta.ui.components

import co.edu.upb.conecta.data.cache.EstadoSincronizacion
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.ZoneId

class TextoIndicadorTest {

    private val bogota = ZoneId.of("America/Bogota")
    // 22 sep 2026, 17:00 en Bogotá (UTC-5)
    private val ahora = Instant.parse("2026-09-22T22:00:00Z")

    private fun estado(
        ultima: Instant?,
        hayConexion: Boolean = true,
        sincronizando: Boolean = false,
        fallo: Boolean = false
    ) = EstadoSincronizacion(ultima, hayConexion, sincronizando, fallo)

    @Test
    fun `sin conexion advierte y muestra fecha y hora de la ultima actualizacion`() {
        val texto = textoIndicador(estado(Instant.parse("2026-09-22T14:05:00Z"), hayConexion = false), ahora, bogota)

        assertTrue(texto.esAdvertencia)
        assertTrue(texto.titulo.startsWith("Sin conexión"))
        assertTrue(texto.detalle.contains("hoy a las 09:05"))
    }

    @Test
    fun `sin conexion y sin nada guardado lo dice en vez de inventar una fecha`() {
        val texto = textoIndicador(estado(null, hayConexion = false), ahora, bogota)

        assertTrue(texto.esAdvertencia)
        assertTrue(texto.detalle.contains("Todavía no hay convocatorias guardadas"))
    }

    @Test
    fun `con red y al dia es una linea discreta`() {
        val texto = textoIndicador(estado(Instant.parse("2026-09-22T21:58:00Z")), ahora, bogota)

        assertFalse(texto.esAdvertencia)
        assertEquals("Actualizado hoy a las 16:58", texto.titulo)
    }

    @Test
    fun `mientras sincroniza lo indica y conserva la fecha anterior`() {
        val texto = textoIndicador(
            estado(Instant.parse("2026-09-21T13:00:00Z"), sincronizando = true), ahora, bogota
        )

        assertFalse(texto.esAdvertencia)
        assertTrue(texto.titulo.startsWith("Actualizando"))
        assertTrue(texto.detalle.contains("ayer a las 08:00"))
    }

    @Test
    fun `si la ultima sincronizacion fallo advierte aunque haya red`() {
        val texto = textoIndicador(
            estado(Instant.parse("2026-09-21T13:00:00Z"), fallo = true), ahora, bogota
        )

        assertTrue(texto.esAdvertencia)
        assertTrue(texto.detalle.contains("ayer a las 08:00"))
    }

    @Test
    fun `describe el momento segun que tan lejos este`() {
        val hoy = describirMomento(Instant.parse("2026-09-22T05:00:00Z"), ahora, bogota)
        val ayer = describirMomento(Instant.parse("2026-09-22T04:59:00Z"), ahora, bogota)
        val esteAnio = describirMomento(Instant.parse("2026-09-10T15:40:00Z"), ahora, bogota)
        val otroAnio = describirMomento(Instant.parse("2025-12-31T15:40:00Z"), ahora, bogota)

        assertEquals("hoy a las 00:00", hoy)
        assertEquals("ayer a las 23:59", ayer)
        assertTrue(esteAnio.startsWith("10 de ") && esteAnio.endsWith(" a las 10:40"))
        assertTrue(otroAnio.startsWith("31 de ") && otroAnio.contains("de 2025 a las 10:40"))
    }
}
