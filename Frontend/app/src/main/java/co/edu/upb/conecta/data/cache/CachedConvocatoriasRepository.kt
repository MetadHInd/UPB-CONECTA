package co.edu.upb.conecta.data.cache

import co.edu.upb.conecta.data.conectividad.ConnectivityObserver
import co.edu.upb.conecta.data.repository.ConvocatoriasRepository
import co.edu.upb.conecta.data.sesion.CacheDeSesion
import co.edu.upb.conecta.domain.model.Convocatoria
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.time.Clock

/**
 * Decorador offline-first de [ConvocatoriasRepository] (HU-17).
 *
 * Las pantallas siempre leen del disco (la caché local); la fuente remota
 * solo alimenta ese disco cuando hay red. Así el feed se ve igual con o sin
 * conexión y las pantallas no saben de dónde vino el dato: siguen llamando a
 * `obtenerTodas()`/`obtenerPorId()` como con `FakeConvocatoriasRepository`.
 *
 * [remoto] es hoy `FakeConvocatoriasRepository`; cuando exista
 * `HttpConvocatoriasRepository` se cambia esa línea en `AppContainer` y esta
 * clase no se entera. Se llama en [despachadorRemoto] (IO), así que una
 * implementación HTTP bloqueante no toca el hilo principal.
 */
class CachedConvocatoriasRepository(
    private val remoto: ConvocatoriasRepository,
    private val cacheLocal: CacheLocalConvocatorias,
    private val conectividad: ConnectivityObserver,
    private val scope: CoroutineScope,
    private val reloj: Clock = Clock.systemUTC(),
    private val despachadorRemoto: CoroutineDispatcher = Dispatchers.IO
) : ConvocatoriasRepository, CacheDeSesion {

    private val mutex = Mutex()
    private val sincronizando = MutableStateFlow(false)
    private val falloUltimoIntento = MutableStateFlow(false)
    private var sincronizacionAutomatica: Job? = null

    private val convocatorias: StateFlow<List<Convocatoria>> =
        cacheLocal.observarConvocatorias()
            .stateIn(scope, SharingStarted.Eagerly, emptyList())

    val estadoSincronizacion: StateFlow<EstadoSincronizacion> = combine(
        cacheLocal.observarUltimaSincronizacion(),
        conectividad.hayConexion,
        sincronizando,
        falloUltimoIntento
    ) { ultima, hayConexion, enCurso, fallo ->
        EstadoSincronizacion(ultima, hayConexion, enCurso, fallo)
    }.stateIn(
        scope,
        SharingStarted.Eagerly,
        EstadoSincronizacion(null, conectividad.hayConexion.value, false, false)
    )

    override fun obtenerTodas(): List<Convocatoria> = convocatorias.value

    override fun obtenerPorId(id: String): Convocatoria? =
        convocatorias.value.firstOrNull { it.id == id }

    override fun observarTodas(): StateFlow<List<Convocatoria>> = convocatorias

    /**
     * Sincroniza al activarse si hay red, y otra vez cada vez que la red
     * vuelve (criterio 3). Sin red no hace nada: se sigue sirviendo el disco.
     */
    override fun activar() {
        if (sincronizacionAutomatica?.isActive == true) return
        sincronizacionAutomatica = scope.launch {
            conectividad.hayConexion
                .filter { it }
                .collect { sincronizar() }
        }
    }

    /**
     * Trae la lista remota y la guarda con la marca de tiempo de este
     * instante. Si falla, la caché y su marca de tiempo quedan como estaban:
     * el indicador sigue diciendo la verdad sobre qué tan viejo es el dato.
     */
    suspend fun sincronizar(): ResultadoSincronizacion {
        mutex.withLock {
            if (!conectividad.hayConexion.value) return ResultadoSincronizacion.SinConexion

            sincronizando.value = true
            return try {
                val remotas = withContext(despachadorRemoto) { remoto.obtenerTodas() }
                cacheLocal.reemplazarTodo(remotas, reloj.instant())
                falloUltimoIntento.value = false
                ResultadoSincronizacion.Exito
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                falloUltimoIntento.value = true
                ResultadoSincronizacion.Error(e)
            } finally {
                sincronizando.value = false
            }
        }
    }

    /**
     * Cierre de sesión (criterio 5): se detiene la sincronización automática
     * antes de borrar, para que un cambio de red posterior no vuelva a llenar
     * la caché sin nadie con sesión iniciada.
     */
    override suspend fun borrarContenidoLocal() {
        sincronizacionAutomatica?.cancelAndJoin()
        sincronizacionAutomatica = null
        mutex.withLock {
            cacheLocal.borrarTodo()
            falloUltimoIntento.value = false
        }
    }
}
