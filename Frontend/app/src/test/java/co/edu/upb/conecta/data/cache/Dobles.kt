package co.edu.upb.conecta.data.cache

import co.edu.upb.conecta.data.conectividad.ConnectivityObserver
import co.edu.upb.conecta.data.repository.ConvocatoriasRepository
import co.edu.upb.conecta.domain.model.CategoriaConvocatoria
import co.edu.upb.conecta.domain.model.Convocatoria
import co.edu.upb.conecta.domain.model.Programa
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset

class ConectividadControlable(inicial: Boolean) : ConnectivityObserver {
    override val hayConexion = MutableStateFlow(inicial)
}

/** Hace de "la red": cuenta llamadas y puede fallar a voluntad. */
class RemotoControlable(var respuesta: List<Convocatoria>) : ConvocatoriasRepository {
    var llamadas = 0
        private set
    var fallar = false

    override fun obtenerTodas(): List<Convocatoria> {
        llamadas++
        if (fallar) throw IllegalStateException("el servidor no respondió")
        return respuesta
    }

    override fun obtenerPorId(id: String): Convocatoria? = respuesta.firstOrNull { it.id == id }
}

class CacheLocalEnMemoria : CacheLocalConvocatorias {
    val convocatorias = MutableStateFlow<List<Convocatoria>>(emptyList())
    val ultimaSincronizacion = MutableStateFlow<Instant?>(null)

    override fun observarConvocatorias(): Flow<List<Convocatoria>> = convocatorias
    override fun observarUltimaSincronizacion(): Flow<Instant?> = ultimaSincronizacion

    override suspend fun reemplazarTodo(convocatorias: List<Convocatoria>, sincronizadoEn: Instant) {
        this.convocatorias.value = convocatorias
        ultimaSincronizacion.value = sincronizadoEn
    }

    override suspend fun borrarTodo() {
        convocatorias.value = emptyList()
        ultimaSincronizacion.value = null
    }
}

class RelojControlable(var ahora: Instant) : Clock() {
    override fun instant(): Instant = ahora
    override fun getZone(): ZoneId = ZoneOffset.UTC
    override fun withZone(zone: ZoneId?): Clock = this
}

fun convocatoria(id: String, titulo: String = "Convocatoria $id") = Convocatoria(
    id = id,
    titulo = titulo,
    descripcion = "Descripción de $id",
    categoria = CategoriaConvocatoria.BECA_APOYO,
    programas = listOf(Programa("sistemas", "Ingeniería de Sistemas e Informática", "Ingenierías")),
    fechaPublicacion = LocalDate.of(2026, 9, 1),
    fechaCierre = LocalDate.of(2026, 9, 30),
    fuenteOriginal = "Correo masivo institucional",
    coordinacionResponsable = "Bienestar Universitario"
)
