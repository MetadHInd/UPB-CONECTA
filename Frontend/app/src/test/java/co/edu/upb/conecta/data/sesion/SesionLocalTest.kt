package co.edu.upb.conecta.data.sesion

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

class SesionLocalTest {

    private class CacheRegistrada : CacheDeSesion {
        var activaciones = 0
        var borrados = 0
        override fun activar() {
            activaciones++
        }
        override suspend fun borrarContenidoLocal() {
            borrados++
        }
    }

    @Test
    fun `iniciar y cerrar sesion alcanzan a todas las caches registradas`() = runTest {
        val convocatorias = CacheRegistrada()
        val otra = CacheRegistrada()
        val sesion = SesionLocal(listOf(convocatorias, otra))

        sesion.alIniciarSesion()
        sesion.alCerrarSesion()

        assertEquals(listOf(1, 1), listOf(convocatorias.activaciones, otra.activaciones))
        assertEquals(listOf(1, 1), listOf(convocatorias.borrados, otra.borrados))
    }
}
