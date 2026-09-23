package co.edu.upb.conecta.data.cache

import co.edu.upb.conecta.domain.model.Convocatoria
import kotlinx.coroutines.flow.Flow
import java.time.Instant

/**
 * Puerto de persistencia local de convocatorias (HU-17).
 *
 * [CachedConvocatoriasRepository] solo conoce esta interfaz; el adaptador
 * real es `RoomCacheLocalConvocatorias` y las pruebas usan uno en memoria.
 * La marca de tiempo se guarda explícitamente junto a los datos, en la misma
 * operación, para que nunca describa un contenido distinto al guardado.
 */
interface CacheLocalConvocatorias {
    fun observarConvocatorias(): Flow<List<Convocatoria>>

    /** Instante de la última sincronización exitosa, o `null` si nunca la hubo. */
    fun observarUltimaSincronizacion(): Flow<Instant?>

    /** Sustituye todo el contenido y la marca de tiempo de forma atómica. */
    suspend fun reemplazarTodo(convocatorias: List<Convocatoria>, sincronizadoEn: Instant)

    /** Borra convocatorias y marca de tiempo (cierre de sesión). */
    suspend fun borrarTodo()
}
