package co.edu.upb.conecta.data.local

import co.edu.upb.conecta.data.cache.convocatoria
import co.edu.upb.conecta.domain.model.Programa
import org.junit.Assert.assertEquals
import org.junit.Test

class ConvocatoriaMapperTest {

    @Test
    fun `ida y vuelta por las tablas conserva la convocatoria y el orden de sus programas`() {
        val original = convocatoria("conv-01").copy(
            programas = listOf(
                Programa("sistemas", "Ingeniería de Sistemas e Informática", "Ingenierías"),
                Programa("civil", "Ingeniería Civil", "Ingenierías"),
                Programa("derecho", "Derecho", "Ciencias Jurídicas")
            )
        )

        val fila = ConvocatoriaConProgramas(
            convocatoria = original.aEntidad(orden = 0),
            programas = original.programasAEntidades().reversed()
        )

        assertEquals(original, fila.aDominio())
    }

    @Test
    fun `una convocatoria para toda la comunidad no genera filas de programa`() {
        val paraTodos = convocatoria("conv-02").copy(programas = emptyList())

        assertEquals(emptyList<ConvocatoriaProgramaEntity>(), paraTodos.programasAEntidades())
        assertEquals(paraTodos, ConvocatoriaConProgramas(paraTodos.aEntidad(0), emptyList()).aDominio())
    }
}
