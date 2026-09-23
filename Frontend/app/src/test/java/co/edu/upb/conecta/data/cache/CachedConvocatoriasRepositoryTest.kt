package co.edu.upb.conecta.data.cache

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

@OptIn(ExperimentalCoroutinesApi::class)
class CachedConvocatoriasRepositoryTest {

    private val t0 = Instant.parse("2026-09-22T13:00:00Z")
    private val t1 = Instant.parse("2026-09-22T15:30:00Z")

    private val conectividad = ConectividadControlable(inicial = true)
    private val remoto = RemotoControlable(listOf(convocatoria("conv-01"), convocatoria("conv-02")))
    private val local = CacheLocalEnMemoria()
    private val reloj = RelojControlable(t0)

    private fun TestScope.crearRepositorio() = CachedConvocatoriasRepository(
        remoto = remoto,
        cacheLocal = local,
        conectividad = conectividad,
        scope = backgroundScope,
        reloj = reloj,
        despachadorRemoto = UnconfinedTestDispatcher(testScheduler)
    )

    @Test
    fun `con red, al activarse sincroniza y guarda la marca de tiempo del reloj`() =
        runTest(UnconfinedTestDispatcher()) {
            val repo = crearRepositorio()

            repo.activar()
            runCurrent()

            assertEquals(1, remoto.llamadas)
            assertEquals(listOf("conv-01", "conv-02"), repo.obtenerTodas().map { it.id })
            assertEquals(t0, local.ultimaSincronizacion.value)
            assertEquals(t0, repo.estadoSincronizacion.value.ultimaSincronizacion)
        }

    @Test
    fun `sin red no llama a la fuente remota y sirve lo guardado con su fecha original`() =
        runTest(UnconfinedTestDispatcher()) {
            local.reemplazarTodo(listOf(convocatoria("guardada")), t0)
            conectividad.hayConexion.value = false
            val repo = crearRepositorio()

            repo.activar()
            reloj.ahora = t1
            val resultado = repo.sincronizar()
            runCurrent()

            assertEquals(ResultadoSincronizacion.SinConexion, resultado)
            assertEquals(0, remoto.llamadas)
            assertEquals(listOf("guardada"), repo.obtenerTodas().map { it.id })
            assertEquals("guardada", repo.obtenerPorId("guardada")?.id)
            val estado = repo.estadoSincronizacion.value
            assertFalse(estado.hayConexion)
            assertEquals(t0, estado.ultimaSincronizacion)
        }

    @Test
    fun `al recuperar la red sincroniza en segundo plano y actualiza el indicador`() =
        runTest(UnconfinedTestDispatcher()) {
            conectividad.hayConexion.value = false
            local.reemplazarTodo(listOf(convocatoria("vieja")), t0)
            val repo = crearRepositorio()
            repo.activar()
            runCurrent()
            assertEquals(0, remoto.llamadas)

            reloj.ahora = t1
            conectividad.hayConexion.value = true
            runCurrent()

            assertEquals(1, remoto.llamadas)
            assertEquals(listOf("conv-01", "conv-02"), repo.obtenerTodas().map { it.id })
            val estado = repo.estadoSincronizacion.value
            assertTrue(estado.hayConexion)
            assertFalse(estado.sincronizando)
            assertEquals(t1, estado.ultimaSincronizacion)
        }

    @Test
    fun `cada reconexion vuelve a sincronizar`() = runTest(UnconfinedTestDispatcher()) {
        val repo = crearRepositorio()
        repo.activar()
        runCurrent()

        conectividad.hayConexion.value = false
        runCurrent()
        conectividad.hayConexion.value = true
        runCurrent()

        assertEquals(2, remoto.llamadas)
    }

    @Test
    fun `si la fuente remota falla se conservan los datos y la fecha anteriores`() =
        runTest(UnconfinedTestDispatcher()) {
            local.reemplazarTodo(listOf(convocatoria("guardada")), t0)
            remoto.fallar = true
            val repo = crearRepositorio()

            reloj.ahora = t1
            val resultado = repo.sincronizar()
            runCurrent()

            assertTrue(resultado is ResultadoSincronizacion.Error)
            assertEquals(listOf("guardada"), repo.obtenerTodas().map { it.id })
            val estado = repo.estadoSincronizacion.value
            assertEquals(t0, estado.ultimaSincronizacion)
            assertTrue(estado.falloUltimoIntento)

            remoto.fallar = false
            repo.sincronizar()
            runCurrent()
            assertFalse(repo.estadoSincronizacion.value.falloUltimoIntento)
            assertEquals(t1, repo.estadoSincronizacion.value.ultimaSincronizacion)
        }

    @Test
    fun `al cerrar sesion se borra la cache y deja de sincronizar con cambios de red`() =
        runTest(UnconfinedTestDispatcher()) {
            val repo = crearRepositorio()
            repo.activar()
            runCurrent()
            assertEquals(2, repo.obtenerTodas().size)

            repo.borrarContenidoLocal()
            runCurrent()

            assertTrue(repo.obtenerTodas().isEmpty())
            assertNull(repo.obtenerPorId("conv-01"))
            assertNull(repo.estadoSincronizacion.value.ultimaSincronizacion)

            conectividad.hayConexion.value = false
            runCurrent()
            conectividad.hayConexion.value = true
            runCurrent()
            assertEquals(1, remoto.llamadas)
            assertTrue(local.convocatorias.value.isEmpty())
        }

    @Test
    fun `tras cerrar sesion, un nuevo inicio de sesion vuelve a sincronizar`() =
        runTest(UnconfinedTestDispatcher()) {
            val repo = crearRepositorio()
            repo.activar()
            runCurrent()
            repo.borrarContenidoLocal()

            repo.activar()
            runCurrent()

            assertEquals(2, remoto.llamadas)
            assertEquals(2, repo.obtenerTodas().size)
        }
}
