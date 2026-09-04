package co.edu.upb.conecta.data.mock

import co.edu.upb.conecta.domain.model.*
import java.time.LocalDate
import java.time.LocalDateTime

/**
 * Datos de ejemplo para este front preliminar.
 *
 * Todo aquí es simulado (contenido, empresas, fechas relativas a "hoy") para
 * poder mostrar el flujo completo de la app sin backend todavía. Las fechas
 * se generan relativas a [LocalDate.now] para que la clasificación por
 * urgencia (cierra en ≤3 días) siempre se vea coherente al abrir la app,
 * sin importar qué día sea. Cuando exista la ingesta real (contexto
 * `ingestion` del backend), este objeto se reemplaza por un repositorio que
 * consuma la API.
 */
object MockData {

    private val hoy: LocalDate = LocalDate.now()
    private val ahora: LocalDateTime = LocalDateTime.now()

    // ---------------------------------------------------------------------
    // Convocatorias
    // ---------------------------------------------------------------------
    val convocatorias: List<Convocatoria> = listOf(
        Convocatoria(
            id = "conv-01",
            titulo = "Apertura curso requisito: Cálculo en una Variable — grupo adicional",
            descripcion = "Se habilita un grupo adicional del curso requisito para estudiantes que aún no lo han cursado. Cupos limitados, prioridad a estudiantes de 3.º semestre en adelante.",
            categoria = CategoriaConvocatoria.CURSO_REQUISITO,
            programas = listOf(MockProgramas.sistemas, MockProgramas.industrial, MockProgramas.civil, MockProgramas.electronica),
            fechaPublicacion = hoy.minusDays(1),
            fechaCierre = hoy.plusDays(2),
            fuenteOriginal = "Correo masivo institucional",
            coordinacionResponsable = "Escuela de Ingenierías"
        ),
        Convocatoria(
            id = "conv-02",
            titulo = "Convocatoria beca de excelencia académica 2026-20",
            descripcion = "Beneficio de matrícula para estudiantes con promedio acumulado igual o superior a 4.3. Requiere formulario y certificado de notas actualizado.",
            categoria = CategoriaConvocatoria.BECA_APOYO,
            programas = emptyList(),
            fechaPublicacion = hoy.minusDays(10),
            fechaCierre = hoy.plusDays(9),
            fuenteOriginal = "Bienestar Universitario",
            coordinacionResponsable = "Bienestar Universitario"
        ),
        Convocatoria(
            id = "conv-03",
            titulo = "Inscripción a electivas de profundización — segundo corte",
            descripcion = "Ventana de inscripción para electivas de profundización de Ingeniería de Sistemas. Cupos por electiva sujetos a disponibilidad.",
            categoria = CategoriaConvocatoria.TRAMITE_ACADEMICO,
            programas = listOf(MockProgramas.sistemas),
            fechaPublicacion = hoy.minusDays(3),
            fechaCierre = hoy.plusDays(1),
            fuenteOriginal = "Coordinación de Ingeniería de Sistemas e Informática",
            coordinacionResponsable = "Ingeniería de Sistemas e Informática"
        ),
        Convocatoria(
            id = "conv-04",
            titulo = "Semana de la Ingeniería Industrial — inscripción a talleres",
            descripcion = "Talleres de Lean Manufacturing, Six Sigma y simulación de procesos. Certificado de asistencia con valor en créditos de extensión.",
            categoria = CategoriaConvocatoria.EVENTO,
            programas = listOf(MockProgramas.industrial),
            fechaPublicacion = hoy.minusDays(2),
            fechaCierre = hoy.plusDays(6),
            fuenteOriginal = "Coordinación de Ingeniería Industrial",
            coordinacionResponsable = "Ingeniería Industrial"
        ),
        Convocatoria(
            id = "conv-05",
            titulo = "Movilidad internacional — convenio con universidades en México",
            descripcion = "Convocatoria de intercambio para el próximo semestre. Incluye información sobre homologación de créditos y proceso de postulación.",
            categoria = CategoriaConvocatoria.MOVILIDAD,
            programas = emptyList(),
            fechaPublicacion = hoy.minusDays(15),
            fechaCierre = hoy.plusDays(20),
            fuenteOriginal = "Relaciones Internacionales",
            coordinacionResponsable = "Relaciones Internacionales"
        ),
        Convocatoria(
            id = "conv-06",
            titulo = "Actualización de datos de contacto en el sistema académico",
            descripcion = "Trámite administrativo obligatorio antes del cierre de semestre para garantizar la correcta notificación de resultados.",
            categoria = CategoriaConvocatoria.ADMINISTRATIVA,
            programas = emptyList(),
            fechaPublicacion = hoy.minusDays(5),
            fechaCierre = hoy.plusDays(12),
            fuenteOriginal = "Registro Académico",
            coordinacionResponsable = "Registro Académico"
        ),
        Convocatoria(
            id = "conv-07",
            titulo = "Convocatoria monitoria académica — Bases de Datos",
            descripcion = "Se requiere monitor con curso aprobado con nota igual o superior a 4.0. Incluye apoyo económico y horas de práctica docente.",
            categoria = CategoriaConvocatoria.BECA_APOYO,
            programas = listOf(MockProgramas.sistemas),
            fechaPublicacion = hoy.minusDays(1),
            fechaCierre = hoy.plusDays(3),
            fuenteOriginal = "Coordinación de Ingeniería de Sistemas e Informática",
            coordinacionResponsable = "Ingeniería de Sistemas e Informática"
        )
    )

    // ---------------------------------------------------------------------
    // Prácticas
    // ---------------------------------------------------------------------
    val practicas: List<Practica> = listOf(
        Practica(
            id = "prac-01",
            empresa = "NEXA Soluciones Digitales",
            cargo = "Practicante de Desarrollo de Software",
            programasDestino = listOf(MockProgramas.sistemas),
            modalidad = ModalidadPractica.HIBRIDA,
            ubicacion = "Bucaramanga, Cabecera del Llano",
            fechaCierre = hoy.plusDays(2),
            descripcion = "Apoyo al equipo de desarrollo en mantenimiento de aplicaciones web internas usando TypeScript y Node.js.",
            requisitos = listOf("Cursando 7.º semestre en adelante", "Conocimientos en bases de datos relacionales", "Disponibilidad de 4 horas diarias"),
            contactoCoordinacion = "practicas.sistemas@upb.edu.co"
        ),
        Practica(
            id = "prac-02",
            empresa = "Grupo Empresarial del Oriente",
            cargo = "Practicante de Procesos y Mejora Continua",
            programasDestino = listOf(MockProgramas.industrial),
            modalidad = ModalidadPractica.PRESENCIAL,
            ubicacion = "Girón, Zona Franca",
            fechaCierre = hoy.plusDays(8),
            descripcion = "Apoyo en el levantamiento y documentación de procesos productivos, indicadores de eficiencia y propuestas de mejora.",
            requisitos = listOf("Cursando 8.º semestre en adelante", "Manejo de Excel avanzado", "Disponibilidad de tiempo completo"),
            contactoCoordinacion = "practicas.industrial@upb.edu.co"
        ),
        Practica(
            id = "prac-03",
            empresa = "Constructora Altavista",
            cargo = "Practicante de Interventoría de Obra",
            programasDestino = listOf(MockProgramas.civil),
            modalidad = ModalidadPractica.PRESENCIAL,
            ubicacion = "Floridablanca",
            fechaCierre = hoy.plusDays(15),
            descripcion = "Apoyo en supervisión técnica de obra, control de materiales y verificación de especificaciones.",
            requisitos = listOf("Cursando 8.º semestre en adelante", "Curso de trabajo en alturas vigente (deseable)"),
            contactoCoordinacion = "practicas.civil@upb.edu.co"
        ),
        Practica(
            id = "prac-04",
            empresa = "Contact Center Andino",
            cargo = "Practicante de Talento Humano",
            programasDestino = listOf(MockProgramas.administracion, MockProgramas.psicologia),
            modalidad = ModalidadPractica.HIBRIDA,
            ubicacion = "Bucaramanga, Centro",
            fechaCierre = hoy.plusDays(5),
            descripcion = "Apoyo en procesos de selección, inducción y bienestar laboral para una operación de más de 300 colaboradores.",
            requisitos = listOf("Cursando 8.º semestre en adelante", "Buena redacción y manejo de entrevistas"),
            contactoCoordinacion = "practicas.administracion@upb.edu.co"
        ),
        Practica(
            id = "prac-05",
            empresa = "Radio Vanguardia FM",
            cargo = "Practicante de Contenidos Digitales",
            programasDestino = listOf(MockProgramas.comunicacion),
            modalidad = ModalidadPractica.REMOTA,
            ubicacion = "Bucaramanga (remoto)",
            fechaCierre = hoy.plusDays(4),
            descripcion = "Producción de contenido para redes sociales y apoyo en cubrimiento de eventos institucionales.",
            requisitos = listOf("Cursando 6.º semestre en adelante", "Manejo de edición de video básico"),
            contactoCoordinacion = "practicas.comunicacion@upb.edu.co"
        )
    )

    // ---------------------------------------------------------------------
    // Noticias (con scroll)
    // ---------------------------------------------------------------------
    val noticias: List<Noticia> = listOf(
        Noticia(
            id = "not-01",
            titulo = "UPB Bucaramanga inaugura nuevo laboratorio de manufactura avanzada",
            resumen = "El espacio está equipado con impresión 3D industrial y estaciones de automatización para prácticas de Ingeniería.",
            cuerpo = "La Escuela de Ingenierías puso en funcionamiento un laboratorio con estaciones de manufactura avanzada, pensado para prácticas de los programas de Ingeniería Industrial, Mecánica y afines. El espacio estará disponible para proyectos de grado y semilleros de investigación desde el próximo corte académico.",
            categoria = CategoriaNoticia.INSTITUCIONAL,
            fechaPublicacion = hoy.minusDays(1),
            fuente = "Oficina de Comunicaciones UPB",
            destacada = true,
            likes = 84,
            comentarios = 12
        ),
        Noticia(
            id = "not-02",
            titulo = "Equipo de robótica UPB clasifica a fase nacional de competencia universitaria",
            resumen = "El semillero representará a la Seccional Bucaramanga en la final nacional del próximo mes.",
            cuerpo = "Un equipo conformado por estudiantes de Ingeniería Electrónica y de Sistemas obtuvo el primer lugar en la fase regional de la competencia, con un proyecto de navegación autónoma. La final nacional se realizará en Medellín.",
            categoria = CategoriaNoticia.LOGRO,
            fechaPublicacion = hoy.minusDays(2),
            fuente = "Escuela de Ingenierías",
            destacada = true,
            likes = 156,
            comentarios = 23
        ),
        Noticia(
            id = "not-03",
            titulo = "Abren inscripciones para la Semana de Bienestar Universitario",
            resumen = "Actividades de salud mental, deporte y recreación durante toda la próxima semana en el campus.",
            cuerpo = "Bienestar Universitario invita a toda la comunidad a participar en jornadas de acompañamiento psicológico, torneos deportivos y actividades culturales. La inscripción es gratuita y se realiza en los puntos de información del campus.",
            categoria = CategoriaNoticia.BIENESTAR,
            fechaPublicacion = hoy.minusDays(3),
            fuente = "Bienestar Universitario",
            likes = 47,
            comentarios = 5
        ),
        Noticia(
            id = "not-04",
            titulo = "Grupo de teatro UPB estrena montaje sobre la historia de Bucaramanga",
            resumen = "La obra se presentará en el auditorio principal con entrada libre para estudiantes y egresados.",
            cuerpo = "El grupo de teatro institucional presenta un montaje original que recorre hitos de la historia de la ciudad, con participación de estudiantes de distintos programas académicos.",
            categoria = CategoriaNoticia.CULTURA,
            fechaPublicacion = hoy.minusDays(4),
            fuente = "Bienestar Universitario — Cultura",
            likes = 32,
            comentarios = 4
        ),
        Noticia(
            id = "not-05",
            titulo = "UPB firma convenio de investigación con empresa del sector energético",
            resumen = "El convenio abre pasantías de investigación aplicada para estudiantes de últimos semestres.",
            cuerpo = "El convenio contempla proyectos conjuntos en eficiencia energética y financiación de dos becas de investigación para estudiantes de Ingeniería Electrónica e Industrial.",
            categoria = CategoriaNoticia.INSTITUCIONAL,
            fechaPublicacion = hoy.minusDays(6),
            fuente = "Vicerrectoría de Investigación",
            likes = 63,
            comentarios = 8
        ),
        Noticia(
            id = "not-06",
            titulo = "Selección de fútbol sala femenino UPB gana el clásico universitario",
            resumen = "El equipo venció 4-2 en un partido disputado en el coliseo del campus.",
            cuerpo = "Con goles en el segundo tiempo, la selección femenina remontó el marcador ante su clásico rival, ante un coliseo lleno de estudiantes.",
            categoria = CategoriaNoticia.CULTURA,
            fechaPublicacion = hoy.minusDays(7),
            fuente = "Bienestar Universitario — Deportes",
            likes = 211,
            comentarios = 34
        ),
        Noticia(
            id = "not-07",
            titulo = "Egresada de Ingeniería Industrial es reconocida en premio nacional de innovación",
            resumen = "Su proyecto de grado sobre logística sostenible fue destacado entre más de 200 postulaciones.",
            cuerpo = "La egresada desarrolló un modelo de optimización de rutas para reducir emisiones en cadenas de distribución de última milla, trabajo que inició como proyecto de grado en la Universidad.",
            categoria = CategoriaNoticia.LOGRO,
            fechaPublicacion = hoy.minusDays(9),
            fuente = "Oficina de Egresados",
            likes = 98,
            comentarios = 11
        ),
        Noticia(
            id = "not-08",
            titulo = "Nuevo horario de atención en la Biblioteca durante semana de exámenes",
            resumen = "La biblioteca ampliará su horario hasta las 10:00 p. m. durante la semana de parciales.",
            cuerpo = "Con el fin de apoyar a los estudiantes en época de exámenes, la Biblioteca extenderá su horario de atención y habilitará salas de estudio adicionales.",
            categoria = CategoriaNoticia.INSTITUCIONAL,
            fechaPublicacion = hoy.minusDays(11),
            fuente = "Biblioteca UPB",
            likes = 55,
            comentarios = 6
        )
    )

    // ---------------------------------------------------------------------
    // Foro
    // ---------------------------------------------------------------------
    val postsForo: List<PostForo> = listOf(
        PostForo(
            id = "foro-01",
            titulo = "¿Alguien ha tomado la electiva de Inteligencia Artificial Aplicada?",
            contenido = "Estoy pensando en inscribirla el próximo corte. ¿Qué tan pesada es en carga de proyectos comparada con Bases de Datos II?",
            autorNombre = "Laura Gómez",
            autorVerificado = true,
            programa = MockProgramas.sistemas,
            fecha = ahora.minusHours(3),
            likes = 12,
            estadoModeracion = EstadoModeracion.APROBADO,
            comentarios = listOf(
                ComentarioForo("c1", "Andrés Rueda", true, "La tomé el semestre pasado, tiene un proyecto final grande pero los cortes son livianos.", ahora.minusHours(2)),
                ComentarioForo("c2", "Camila Ortiz", true, "Coincido, el profe explica muy bien la parte de redes neuronales.", ahora.minusHours(1))
            )
        ),
        PostForo(
            id = "foro-02",
            titulo = "Grupo de estudio para el parcial de Cálculo — Biblioteca, sábado",
            contenido = "Vamos a reunirnos el sábado a las 9 a. m. en la sala de grupos de la biblioteca. Si alguien más quiere sumarse, bienvenido.",
            autorNombre = "Juan Pablo Serrano",
            autorVerificado = true,
            programa = MockProgramas.civil,
            fecha = ahora.minusHours(6),
            likes = 8,
            estadoModeracion = EstadoModeracion.APROBADO
        ),
        PostForo(
            id = "foro-03",
            titulo = "Recomendaciones de empresas para práctica en Talento Humano",
            contenido = "Ya voy a 8.º semestre y quiero empezar a mirar opciones de práctica. ¿Qué empresas de la ciudad reciben bien a estudiantes de Psicología?",
            autorNombre = "Valentina Duarte",
            autorVerificado = true,
            programa = MockProgramas.psicologia,
            fecha = ahora.minusHours(10),
            likes = 5,
            estadoModeracion = EstadoModeracion.APROBADO
        ),
        PostForo(
            id = "foro-04",
            titulo = "Publicación en revisión",
            contenido = "Este contenido fue marcado por el moderador automático (posible spam/publicidad) y está pendiente de revisión manual antes de publicarse.",
            autorNombre = "Usuario anónimo",
            autorVerificado = false,
            programa = MockProgramas.TODOS,
            fecha = ahora.minusMinutes(40),
            likes = 0,
            estadoModeracion = EstadoModeracion.EN_REVISION
        ),
        PostForo(
            id = "foro-05",
            titulo = "¿Cómo va la inscripción de electivas para Comunicación Social?",
            contenido = "Vi la convocatoria de electivas de Sistemas pero no encuentro la de nuestro programa. ¿A alguien le ha llegado el correo de coordinación?",
            autorNombre = "Santiago Peña",
            autorVerificado = true,
            programa = MockProgramas.comunicacion,
            fecha = ahora.minusDays(1),
            likes = 3,
            estadoModeracion = EstadoModeracion.APROBADO
        )
    )

    // ---------------------------------------------------------------------
    // Notificaciones
    // ---------------------------------------------------------------------
    val notificaciones: List<Notificacion> = listOf(
        Notificacion(
            id = "notif-01",
            tipo = TipoNotificacion.CONVOCATORIA,
            titulo = "Cierra en 1 día: inscripción a electivas de profundización",
            cuerpo = "La ventana de inscripción para electivas de Ingeniería de Sistemas cierra mañana.",
            fecha = ahora.minusHours(2),
            leida = false,
            referenciaId = "conv-03"
        ),
        Notificacion(
            id = "notif-02",
            tipo = TipoNotificacion.PRACTICA,
            titulo = "Nueva práctica para tu programa: NEXA Soluciones Digitales",
            cuerpo = "Practicante de Desarrollo de Software — cierra en 2 días.",
            fecha = ahora.minusHours(5),
            leida = false,
            referenciaId = "prac-01"
        ),
        Notificacion(
            id = "notif-03",
            tipo = TipoNotificacion.FORO,
            titulo = "Nueva respuesta en tu publicación",
            cuerpo = "Camila Ortiz respondió en \"¿Alguien ha tomado la electiva de Inteligencia Artificial Aplicada?\"",
            fecha = ahora.minusHours(9),
            leida = true,
            referenciaId = "foro-01"
        ),
        Notificacion(
            id = "notif-04",
            tipo = TipoNotificacion.SISTEMA,
            titulo = "Verificación de identidad completada",
            cuerpo = "Tu cuenta institucional quedó verificada. Ya puedes participar en el foro con tu nombre visible.",
            fecha = ahora.minusDays(2),
            leida = true
        ),
        Notificacion(
            id = "notif-05",
            tipo = TipoNotificacion.CONVOCATORIA,
            titulo = "Cierra en 3 días: monitoria académica de Bases de Datos",
            cuerpo = "Convocatoria de monitoria con apoyo económico para tu programa.",
            fecha = ahora.minusDays(1),
            leida = false,
            referenciaId = "conv-07"
        )
    )

    // ---------------------------------------------------------------------
    // Mapa del campus (placeholder)
    // ---------------------------------------------------------------------
    val puntosInteres: List<PuntoInteres> = listOf(
        PuntoInteres("pt-01", "Bloque A — Ingenierías", CategoriaPunto.BLOQUE_ACADEMICO, "Aulas y laboratorios de la Escuela de Ingenierías.", 0.30f, 0.28f),
        PuntoInteres("pt-02", "Bloque B — Ciencias Económicas y Jurídicas", CategoriaPunto.BLOQUE_ACADEMICO, "Aulas de Administración, Contaduría y Derecho.", 0.62f, 0.22f),
        PuntoInteres("pt-03", "Biblioteca Central", CategoriaPunto.BIBLIOTECA, "Salas de estudio individual y grupal, hemeroteca.", 0.48f, 0.45f),
        PuntoInteres("pt-04", "Bienestar Universitario", CategoriaPunto.BIENESTAR, "Atención psicológica, deportes y actividades culturales.", 0.20f, 0.60f),
        PuntoInteres("pt-05", "Coordinación Ingeniería de Sistemas", CategoriaPunto.COORDINACION, "Bloque A, piso 3, oficina 304.", 0.33f, 0.33f),
        PuntoInteres("pt-06", "Cafetería Central", CategoriaPunto.SERVICIOS, "Zona de comidas y cafetería principal del campus.", 0.55f, 0.62f),
        PuntoInteres("pt-07", "Coliseo y zona deportiva", CategoriaPunto.DEPORTES, "Canchas múltiples, gimnasio y coliseo cubierto.", 0.75f, 0.68f),
        PuntoInteres("pt-08", "Parqueadero principal", CategoriaPunto.PARQUEADERO, "Acceso vehicular por la entrada norte del campus.", 0.15f, 0.15f)
    )

    // ---------------------------------------------------------------------
    // Chatbot — preguntas frecuentes
    // ---------------------------------------------------------------------
    val preguntasFrecuentes: List<PreguntaFrecuente> = listOf(
        PreguntaFrecuente(
            "¿Cómo verifico mi identidad para participar en el foro?",
            "Ingresa a tu Perfil y toca \"Verificar identidad institucional\". Se valida con tu correo @upb.edu.co; el proceso es automático y no requiere subir documentos."
        ),
        PreguntaFrecuente(
            "¿Cómo sé si una convocatoria aplica a mi programa?",
            "Cada convocatoria muestra los programas a los que va dirigida. Si no muestra ningún programa específico, aplica a toda la comunidad universitaria. También puedes filtrar el inicio por tu programa."
        ),
        PreguntaFrecuente(
            "¿Con cuánta anticipación llegan las notificaciones de cierre?",
            "Por defecto recibirás una notificación cuando falten 3 días para el cierre de una convocatoria o práctica relevante para tu programa, y otra el último día."
        ),
        PreguntaFrecuente(
            "¿Qué pasa si mi publicación en el foro queda \"en revisión\"?",
            "El moderador automático marca publicaciones con patrones de spam, enlaces externos sospechosos o lenguaje inapropiado para revisión manual antes de mostrarlas públicamente."
        ),
        PreguntaFrecuente(
            "¿Puedo postularme a una práctica desde la app?",
            "En esta versión preliminar puedes ver el detalle y el contacto de la coordinación responsable. La postulación en línea está planeada para una siguiente iteración."
        ),
        PreguntaFrecuente(
            "¿La app reemplaza el correo institucional?",
            "No. UPB Conecta organiza y prioriza la misma información que hoy llega por correo, pero no reemplaza los canales oficiales de comunicación de la Universidad."
        )
    )

    val usuarioActual = Usuario(
        nombre = "Miguel José Vargas Martínez",
        correoInstitucional = "miguel.vargas@upb.edu.co",
        programa = MockProgramas.sistemas,
        semestre = 7,
        identidadVerificada = true
    )
}
