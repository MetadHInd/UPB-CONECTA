package co.edu.upb.conecta.data.local

import co.edu.upb.conecta.data.cache.CacheLocalConvocatorias
import co.edu.upb.conecta.domain.model.Convocatoria
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.time.Instant

/** Adaptador Room de [CacheLocalConvocatorias]. */
class RoomCacheLocalConvocatorias(private val dao: ConvocatoriasCacheDao) : CacheLocalConvocatorias {

    override fun observarConvocatorias(): Flow<List<Convocatoria>> =
        dao.observarConvocatorias().map { filas -> filas.map { it.aDominio() } }

    override fun observarUltimaSincronizacion(): Flow<Instant?> =
        dao.observarUltimaSincronizacion(RECURSO).map { ms -> ms?.let(Instant::ofEpochMilli) }

    override suspend fun reemplazarTodo(convocatorias: List<Convocatoria>, sincronizadoEn: Instant) {
        dao.reemplazarTodo(
            convocatorias = convocatorias.mapIndexed { orden, it -> it.aEntidad(orden) },
            programas = convocatorias.flatMap { it.programasAEntidades() },
            sincronizacion = SincronizacionEntity(RECURSO, sincronizadoEn.toEpochMilli())
        )
    }

    override suspend fun borrarTodo() {
        dao.borrarTodo(RECURSO)
    }

    private companion object {
        const val RECURSO = "convocatorias"
    }
}
