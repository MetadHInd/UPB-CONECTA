package co.edu.upb.conecta.data.repository

import android.content.Context
import co.edu.upb.conecta.data.cache.CachedConvocatoriasRepository
import co.edu.upb.conecta.data.conectividad.AndroidConnectivityObserver
import co.edu.upb.conecta.data.conectividad.ConnectivityObserver
import co.edu.upb.conecta.data.local.RoomCacheLocalConvocatorias
import co.edu.upb.conecta.data.local.UpbConectaDatabase
import co.edu.upb.conecta.data.mock.MockData
import co.edu.upb.conecta.data.sesion.SesionLocal
import co.edu.upb.conecta.domain.model.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow

/**
 * Repositorios de este front preliminar.
 *
 * Cada interfaz representa el "puerto" que en el futuro implementará un
 * adaptador real contra el backend (ver `src/contexts/` en el repositorio
 * de backend, que ya sigue arquitectura hexagonal). Por ahora solo existe
 * la implementación `Fake*` respaldada por [MockData], para que sustituirla
 * más adelante sea un cambio de una línea en [AppContainer] — el mismo
 * principio que ya aplica el backend con sus adaptadores de `ingestion`.
 */
interface ConvocatoriasRepository {
    fun obtenerTodas(): List<Convocatoria>
    fun obtenerPorId(id: String): Convocatoria?

    /**
     * Lista observable, para pantallas que deben refrescarse cuando el dato
     * cambia (p. ej. al terminar una sincronización, HU-17). Por defecto
     * emite una sola vez [obtenerTodas], así que una fuente que no cambia
     * sola no tiene que implementarlo.
     */
    fun observarTodas(): Flow<List<Convocatoria>> = flow { emit(obtenerTodas()) }
}

class FakeConvocatoriasRepository : ConvocatoriasRepository {
    override fun obtenerTodas(): List<Convocatoria> =
        MockData.convocatorias.sortedBy { it.fechaCierre }

    override fun obtenerPorId(id: String): Convocatoria? =
        MockData.convocatorias.firstOrNull { it.id == id }
}

interface PracticasRepository {
    fun obtenerTodas(): List<Practica>
    fun obtenerPorId(id: String): Practica?
}

class FakePracticasRepository : PracticasRepository {
    override fun obtenerTodas(): List<Practica> =
        MockData.practicas.sortedBy { it.fechaCierre }

    override fun obtenerPorId(id: String): Practica? =
        MockData.practicas.firstOrNull { it.id == id }
}

interface NoticiasRepository {
    fun obtenerTodas(): List<Noticia>
}

class FakeNoticiasRepository : NoticiasRepository {
    override fun obtenerTodas(): List<Noticia> =
        MockData.noticias.sortedByDescending { it.fechaPublicacion }
}

interface ForoRepository {
    fun obtenerPosts(): List<PostForo>
    fun obtenerPostPorId(id: String): PostForo?
}

class FakeForoRepository : ForoRepository {
    override fun obtenerPosts(): List<PostForo> =
        MockData.postsForo.sortedByDescending { it.fecha }

    override fun obtenerPostPorId(id: String): PostForo? =
        MockData.postsForo.firstOrNull { it.id == id }
}

interface NotificacionesRepository {
    fun obtenerTodas(): List<Notificacion>
}

class FakeNotificacionesRepository : NotificacionesRepository {
    override fun obtenerTodas(): List<Notificacion> =
        MockData.notificaciones.sortedByDescending { it.fecha }
}

interface MapaRepository {
    fun obtenerPuntosDeInteres(): List<PuntoInteres>
}

class FakeMapaRepository : MapaRepository {
    override fun obtenerPuntosDeInteres(): List<PuntoInteres> = MockData.puntosInteres
}

interface ChatbotRepository {
    fun obtenerPreguntasFrecuentes(): List<PreguntaFrecuente>
    fun responder(pregunta: String): String
}

class FakeChatbotRepository : ChatbotRepository {
    override fun obtenerPreguntasFrecuentes(): List<PreguntaFrecuente> = MockData.preguntasFrecuentes

    override fun responder(pregunta: String): String {
        val coincidencia = MockData.preguntasFrecuentes.firstOrNull {
            it.pregunta.contains(pregunta, ignoreCase = true) ||
                pregunta.split(" ").any { palabra ->
                    palabra.length > 4 && it.pregunta.contains(palabra, ignoreCase = true)
                }
        }
        return coincidencia?.respuesta
            ?: "No encontré una respuesta exacta en las preguntas frecuentes. " +
                "Puedes revisar la lista de abajo o escribir a tu coordinación de programa. " +
                "(Respuesta simulada — el chatbot real se conectará a una base de conocimiento del backend)."
    }
}

interface UsuarioRepository {
    fun obtenerUsuarioActual(): Usuario
}

class FakeUsuarioRepository : UsuarioRepository {
    override fun obtenerUsuarioActual(): Usuario = MockData.usuarioActual
}

/** Resultado de un intento de inicio de sesión. */
sealed class ResultadoLogin {
    data class Exito(val usuario: Usuario) : ResultadoLogin()
    data class Error(val mensaje: String) : ResultadoLogin()
}

/**
 * Puerto de autenticación. El backend todavía no expone un contexto de
 * identidad (ver `ARQUITECTURA-INTEGRACION.md`), así que por ahora solo
 * existe [FakeAuthRepository] con credenciales de prueba fijas — el mismo
 * patrón `Fake*`/`Http*` que el resto de repositorios: el día que exista el
 * endpoint real de login, se agrega un `HttpAuthRepository` y se cambia una
 * línea en [AppContainer].
 */
interface AuthRepository {
    fun iniciarSesion(correoInstitucional: String, contrasena: String): ResultadoLogin
}

class FakeAuthRepository(private val usuarioRepository: UsuarioRepository) : AuthRepository {
    // Credencial de prueba fija para este front preliminar — no hay backend
    // de autenticación todavía. Se muestra en la propia pantalla de login.
    private val contrasenaDePrueba = "upb2026"
    private val dominioInstitucional = "@upb.edu.co"

    override fun iniciarSesion(correoInstitucional: String, contrasena: String): ResultadoLogin {
        val correo = correoInstitucional.trim()
        return when {
            correo.isBlank() || contrasena.isBlank() ->
                ResultadoLogin.Error("Ingresa tu correo institucional y tu contraseña.")

            !correo.endsWith(dominioInstitucional, ignoreCase = true) ->
                ResultadoLogin.Error("Usa tu correo institucional ($dominioInstitucional).")

            contrasena != contrasenaDePrueba ->
                ResultadoLogin.Error("Contraseña incorrecta.")

            else -> ResultadoLogin.Exito(usuarioRepository.obtenerUsuarioActual())
        }
    }
}

/**
 * Contenedor simple de dependencias. Sin Hilt/Koin a propósito: para un
 * front preliminar de un solo módulo, instanciar aquí es suficiente y
 * evita una dependencia adicional que Android Studio tendría que resolver
 * antes de poder previsualizar nada. Si el proyecto crece, este es el
 * punto natural para introducir inyección de dependencias.
 */
object AppContainer {
    /** Vive lo que vive el proceso: sincronización y conectividad (HU-17). */
    private val scopeAplicacion = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    lateinit var conectividad: ConnectivityObserver
        private set

    /**
     * Convocatorias con caché sin conexión (HU-17). Las pantallas lo ven
     * como un [ConvocatoriasRepository] más.
     */
    lateinit var convocatorias: CachedConvocatoriasRepository
        private set
    val convocatoriasRepository: ConvocatoriasRepository get() = convocatorias

    lateinit var sesionLocal: SesionLocal
        private set

    /** Lo llama `UPBConectaApp.onCreate()`: Room y la red necesitan un Context. */
    fun inicializar(context: Context) {
        conectividad = AndroidConnectivityObserver(context, scopeAplicacion)
        convocatorias = CachedConvocatoriasRepository(
            // La "red" detrás de la caché. Cuando exista, esta es la línea que
            // pasa a ser HttpConvocatoriasRepository (ARQUITECTURA-INTEGRACION.md §7).
            remoto = FakeConvocatoriasRepository(),
            cacheLocal = RoomCacheLocalConvocatorias(UpbConectaDatabase.crear(context).convocatoriasCacheDao()),
            conectividad = conectividad,
            scope = scopeAplicacion
        )
        sesionLocal = SesionLocal(listOf(convocatorias))
    }

    val practicasRepository: PracticasRepository = FakePracticasRepository()
    val noticiasRepository: NoticiasRepository = FakeNoticiasRepository()
    val foroRepository: ForoRepository = FakeForoRepository()
    val notificacionesRepository: NotificacionesRepository = FakeNotificacionesRepository()
    val mapaRepository: MapaRepository = FakeMapaRepository()
    val chatbotRepository: ChatbotRepository = FakeChatbotRepository()
    val usuarioRepository: UsuarioRepository = FakeUsuarioRepository()
    val authRepository: AuthRepository = FakeAuthRepository(usuarioRepository)
}
