package co.edu.upb.conecta

import android.app.Application
import co.edu.upb.conecta.data.repository.AppContainer

/** Arma las dependencias que necesitan un Context (Room, conectividad) antes de la primera pantalla. */
class UPBConectaApp : Application() {
    override fun onCreate() {
        super.onCreate()
        AppContainer.inicializar(this)
    }
}
