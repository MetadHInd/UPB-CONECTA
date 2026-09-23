package co.edu.upb.conecta.data.local

import androidx.room.ColumnInfo
import androidx.room.Embedded
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import androidx.room.Relation

/**
 * Tablas de la caché local de convocatorias (HU-17). Son un detalle de
 * persistencia: nada fuera de `data/local` las ve, se traducen a
 * [co.edu.upb.conecta.domain.model.Convocatoria] en `ConvocatoriaMapper.kt`.
 */
@Entity(tableName = "convocatorias_cache")
data class ConvocatoriaEntity(
    @PrimaryKey val id: String,
    val titulo: String,
    val descripcion: String,
    /** Nombre de [co.edu.upb.conecta.domain.model.CategoriaConvocatoria]. */
    val categoria: String,
    @ColumnInfo(name = "fecha_publicacion_epoch_day") val fechaPublicacionEpochDay: Long,
    @ColumnInfo(name = "fecha_cierre_epoch_day") val fechaCierreEpochDay: Long,
    @ColumnInfo(name = "fuente_original") val fuenteOriginal: String,
    @ColumnInfo(name = "coordinacion_responsable") val coordinacionResponsable: String,
    /** Posición en la lista remota, para devolverla en el mismo orden. */
    val orden: Int
)

@Entity(
    tableName = "convocatoria_programas_cache",
    primaryKeys = ["convocatoria_id", "programa_id"],
    foreignKeys = [
        ForeignKey(
            entity = ConvocatoriaEntity::class,
            parentColumns = ["id"],
            childColumns = ["convocatoria_id"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [Index("convocatoria_id")]
)
data class ConvocatoriaProgramaEntity(
    @ColumnInfo(name = "convocatoria_id") val convocatoriaId: String,
    @ColumnInfo(name = "programa_id") val programaId: String,
    val nombre: String,
    val facultad: String,
    val orden: Int
)

data class ConvocatoriaConProgramas(
    @Embedded val convocatoria: ConvocatoriaEntity,
    @Relation(parentColumn = "id", entityColumn = "convocatoria_id")
    val programas: List<ConvocatoriaProgramaEntity>
)

/**
 * Marca de tiempo de la última sincronización exitosa por recurso. Se
 * escribe en la misma transacción que los datos que describe.
 */
@Entity(tableName = "sincronizacion_cache")
data class SincronizacionEntity(
    @PrimaryKey val recurso: String,
    @ColumnInfo(name = "ultima_sincronizacion_epoch_ms") val ultimaSincronizacionEpochMs: Long
)
