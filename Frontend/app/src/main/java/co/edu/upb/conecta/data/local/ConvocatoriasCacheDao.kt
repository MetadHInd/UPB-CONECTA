package co.edu.upb.conecta.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface ConvocatoriasCacheDao {

    @Transaction
    @Query("SELECT * FROM convocatorias_cache ORDER BY orden")
    fun observarConvocatorias(): Flow<List<ConvocatoriaConProgramas>>

    @Query("SELECT ultima_sincronizacion_epoch_ms FROM sincronizacion_cache WHERE recurso = :recurso")
    fun observarUltimaSincronizacion(recurso: String): Flow<Long?>

    @Insert
    suspend fun insertarConvocatorias(convocatorias: List<ConvocatoriaEntity>)

    @Insert
    suspend fun insertarProgramas(programas: List<ConvocatoriaProgramaEntity>)

    @Upsert
    suspend fun guardarSincronizacion(sincronizacion: SincronizacionEntity)

    @Query("DELETE FROM convocatoria_programas_cache")
    suspend fun borrarProgramas()

    @Query("DELETE FROM convocatorias_cache")
    suspend fun borrarConvocatorias()

    @Query("DELETE FROM sincronizacion_cache WHERE recurso = :recurso")
    suspend fun borrarSincronizacion(recurso: String)

    /** Datos y marca de tiempo cambian juntos o no cambian. */
    @Transaction
    suspend fun reemplazarTodo(
        convocatorias: List<ConvocatoriaEntity>,
        programas: List<ConvocatoriaProgramaEntity>,
        sincronizacion: SincronizacionEntity
    ) {
        borrarProgramas()
        borrarConvocatorias()
        insertarConvocatorias(convocatorias)
        insertarProgramas(programas)
        guardarSincronizacion(sincronizacion)
    }

    @Transaction
    suspend fun borrarTodo(recurso: String) {
        borrarProgramas()
        borrarConvocatorias()
        borrarSincronizacion(recurso)
    }
}
