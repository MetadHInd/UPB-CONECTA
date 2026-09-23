package co.edu.upb.conecta.domain.conectividad

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PoliticaAccionConRedTest {

    @Test
    fun `con red la accion se ejecuta`() {
        AccionConRed.entries.forEach { accion ->
            assertEquals(DecisionAccionConRed.Ejecutar, PoliticaAccionConRed.evaluar(true, accion))
        }
    }

    @Test
    fun `sin red se bloquea con un mensaje que dice que no se envio y una accion sugerida`() {
        val decision = PoliticaAccionConRed.evaluar(false, AccionConRed.POSTULAR_CONVOCATORIA)

        assertTrue(decision is DecisionAccionConRed.Bloquear)
        val aviso = (decision as DecisionAccionConRed.Bloquear).aviso
        assertTrue(aviso.mensaje.contains("postularte a una convocatoria"))
        assertTrue(aviso.mensaje.contains("no se ha enviado"))
        assertTrue(aviso.accionSugerida.contains("Reintentar"))
    }

    @Test
    fun `el aviso nombra la accion concreta que se intento`() {
        val decision = PoliticaAccionConRed.evaluar(false, AccionConRed.PUBLICAR_EN_FORO)

        val aviso = (decision as DecisionAccionConRed.Bloquear).aviso
        assertTrue(aviso.mensaje.contains("publicar en el foro"))
    }
}
