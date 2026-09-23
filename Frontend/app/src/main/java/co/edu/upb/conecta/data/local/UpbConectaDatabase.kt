package co.edu.upb.conecta.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

/**
 * Base de datos local de la app. Por ahora solo guarda la caché de
 * convocatorias (HU-17).
 *
 * `exportSchema = false` y migración destructiva a propósito: todo lo que hay
 * aquí es una copia descartable de datos del servidor, así que ante un cambio
 * de esquema basta con borrarla y volver a sincronizar. Si algún día se
 * guarda algo que solo exista en el dispositivo, eso deja de valer y hay que
 * escribir migraciones.
 */
@Database(
    entities = [
        ConvocatoriaEntity::class,
        ConvocatoriaProgramaEntity::class,
        SincronizacionEntity::class
    ],
    version = 1,
    exportSchema = false
)
abstract class UpbConectaDatabase : RoomDatabase() {

    abstract fun convocatoriasCacheDao(): ConvocatoriasCacheDao

    companion object {
        fun crear(context: Context): UpbConectaDatabase =
            Room.databaseBuilder(context.applicationContext, UpbConectaDatabase::class.java, "upb_conecta.db")
                .fallbackToDestructiveMigration()
                .build()
    }
}
