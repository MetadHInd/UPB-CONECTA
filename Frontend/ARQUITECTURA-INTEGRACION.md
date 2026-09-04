# Arquitectura de integración — UPB Conecta (front Android ↔ back Node/TypeScript)

Revisé el zip nuevo del backend (`UPBCONECTAmain.zip`) contra el que ya tenía: **es idéntico**, no hay cambios de código. Sigue implementando solo HU-01 (ingesta programada e idempotente al buzón institucional, escribiendo a MongoDB) y `package.json` solo tiene `mongodb` como dependencia de producción — **todavía no hay ningún framework HTTP instalado ni ningún endpoint expuesto**. Eso es el dato que más importa para responder tu pregunta: hoy el backend no es un servicio con el que el front pueda hablar, es un proceso de ingesta que llena una base de datos. La arquitectura que necesitas es, sobre todo, la que le agrega esa "puerta de salida" hacia el móvil sin romper lo que ya tienes.

## Resumen de la recomendación

Mantén los dos proyectos exactamente como los tienes — dos repositorios/carpetas independientes — y conéctalos con **una API REST JSON** que el backend expone como *adaptador de entrada* (driving adapter) sobre su arquitectura hexagonal, y que el front consume a través de la capa `data/repository` que ya construiste con la interfaz `Fake*Repository`/`Http*Repository`. Ninguno de los dos proyectos necesita fusionarse ni conocer detalles internos del otro: lo único que comparten es un **contrato** (qué URLs existen, qué JSON entra y sale). Es la misma idea de puertos y adaptadores que ya usa el backend para el buzón IMAP, aplicada ahora a la entrada por HTTP en vez de a la entrada por correo.

```
┌─────────────────────────┐        HTTPS / JSON        ┌───────────────────────────────────────┐
│   UPB-Conecta-Frontend  │ ──────────────────────────▶ │            UPB-CONECTA-main            │
│   (Android, Compose)    │ ◀────────────────────────── │        (Node/TS, hexagonal)            │
│                          │      contrato REST          │                                         │
│ data/repository/         │                              │ src/contexts/<contexto>/infrastructure│
│   Http*Repository  ──────┼──implementa la misma interfaz┼─▶ http/  (controladores, nuevo)        │
│   Fake*Repository         │  que ya usan las pantallas   │ application/ (casos de uso, ya existen│
│ AppContainer (elige cuál) │                              │              o se agregan)             │
└─────────────────────────┘                              │ domain/ (no cambia por esto)          │
                                                            │ mongo/ (ya existe para ingestion)     │
                                                            └───────────────────────────────────────┘
```

## 1. Qué le falta al backend: una capa de "salida" HTTP

Hoy `src/contexts/ingestion/` tiene `domain / application / infrastructure`, pero `infrastructure` solo contiene adaptadores de **entrada de datos** (IMAP, Mongo, memoria) — nada que responda peticiones. Necesitas agregar, para cada contexto que el front va a consultar, un adaptador HTTP dentro de ese mismo patrón:

```
src/contexts/<contexto>/
  domain/           (igual que hoy)
  application/       casos de uso de lectura para el front, ej. ListarConvocatoriasActivas
  infrastructure/
    mongo/           (ya existe en ingestion)
    http/            NUEVO: controladores/rutas que llaman al caso de uso y serializan la respuesta
src/infrastructure/http/
    server.ts         NUEVO: un único servidor (Express o Fastify) que monta las rutas de cada contexto
    dto/               NUEVO: los "shapes" de request/response, separados del modelo de dominio
```

Puntos clave, coherentes con lo que ya defiende tu propio README del backend:

- **El dominio y la aplicación no se enteran de que existe HTTP.** Un controlador en `infrastructure/http` llama a un caso de uso (`application/`) y traduce su resultado a JSON — igual que hoy el scheduler de ingesta llama al caso de uso y no al revés. `scripts/check-architecture.mjs` debería seguir pasando sin tocarlo.
- **No expongas los documentos de Mongo tal cual.** Define un DTO de respuesta por endpoint (`ConvocatoriaResponseDTO`, por ejemplo) y mapea el resultado del caso de uso a ese DTO. Así el día que cambie el modelo interno o el motor de persistencia, el contrato con el móvil no se rompe.
- **Un solo framework HTTP para todos los contextos** (te recomendaría Fastify por ser liviano y con validación de esquema integrada, o Express si prefieres algo más conocido/documentado) montado en `src/infrastructure/http/server.ts`, que importa las rutas de cada contexto — así cada contexto sigue siendo dueño de sus propias rutas sin que tengan que conocerse entre sí.
- Contextos que el backlog ya prevé (`classification`, `feed`, `moderation`, notificaciones) son exactamente los que necesitas para que el front deje de depender de datos de ejemplo: cada uno nace con su propio `domain/application/infrastructure`, igual que `ingestion`.
- Para la primera versión ni siquiera necesitas los 12 épicas — con exponer **lectura** de convocatorias y prácticas (lo que ya recolecta `ingestion` una vez tenga clasificación básica) el front puede reemplazar su primer `Fake*Repository`.

## 2. Qué le falta al front: la implementación `Http*Repository`

Ya dejaste el seam correcto (`AppContainer` + interfaces `*Repository` + `Fake*Repository`), así que el cambio es aditivo, no una reescritura:

- **Cliente HTTP**: agrega Retrofit + OkHttp (+ un convertidor, `kotlinx-serialization` o Moshi) al catálogo de versiones. Es el estándar de facto en Android y evita escribir parsing a mano.
- **DTOs de red separados del dominio**: `data/remote/dto/ConvocatoriaDto.kt` (con los nombres de campo tal cual los devuelve el backend) + una función `ConvocatoriaDto.toDomain()` que arma el `Convocatoria` que ya usan tus pantallas. Así un cambio de forma en el JSON del backend se arregla en un mapper, sin tocar `ui/`.
- **`Http*Repository` implementa la misma interfaz que `Fake*Repository`** (por ejemplo `HttpConvocatoriasRepository : ConvocatoriasRepository`), llama al servicio Retrofit y mapea DTO → dominio. Las pantallas siguen recibiendo `List<Convocatoria>`; no saben si viene de mock o de red.
- **`AppContainer` decide cuál usar**, y te conviene que lo decida por *build type/flavor* en vez de a mano: mientras un contexto del backend no exista todavía, ese repositorio sigue siendo `Fake*`; en cuanto el backend exponga `feed`/`classification`, cambias esa única línea a `Http*`. Puedes migrar contexto por contexto (convocatorias primero, foro después, etc.) sin bloquear el resto de la app.
- **Manejo de errores/carga**: como vas a pasar de datos síncronos en memoria a una llamada de red real, conviene envolver las respuestas del repositorio en un tipo simple tipo `Result<T>`/`sealed class Recurso<T>` (Éxito/Cargando/Error) para que las pantallas puedan mostrar un estado de error o reintento — algo que con `Fake*Repository` no hacía falta porque nunca fallaba.
- **Configuración de entorno**: la URL base del backend no debería quedar quemada en el código — defínela como `buildConfigField` en `app/build.gradle.kts` (una para `debug`, apuntando a `10.0.2.2` si corres el backend local desde el emulador, y otra para `release`) para no mezclar configuración con lógica.

## 3. Identidad verificada y autenticación

El foro y el perfil dependen de "identidad verificada" — eso implica que el backend necesita un contexto de autenticación/identidad (probablemente contra el correo institucional) que hoy tampoco existe. Recomendación mínima viable:

- El backend emite un **JWT** al autenticarse (contexto nuevo, ej. `identity` o `auth`), con expiración corta + refresh, siguiendo la misma separación domain/application/infrastructure (el "cómo" de emitir/verificar el token es infraestructura; la política de qué hace válida una sesión es dominio).
- El front guarda el token en `EncryptedSharedPreferences` o `DataStore` (no en `SharedPreferences` plano ni en memoria de `AppContainer`), y un `Interceptor` de OkHttp lo agrega como header `Authorization: Bearer <token>` a cada llamada — así ningún repositorio individual tiene que preocuparse por adjuntar el token.
- Los endpoints que requieren identidad verificada (publicar en el foro, por ejemplo) rechazan en el controlador HTTP si el JWT no es válido, antes de llegar al caso de uso — es la misma idea de "no dejar entrar infraestructura al dominio" pero aplicada a autorización.

## 4. Notificaciones anticipadas

Esto es más un problema de **quién dispara el evento** que de dónde vive el código: el backend ya tiene el dato de fecha de cierre; falta un job/contexto que revise convocatorias próximas a cerrar y llame a Firebase Cloud Messaging (FCM) para empujar la notificación al móvil. No necesitas un broker de mensajes para el alcance actual: un scheduler más (como el que ya usa `ingestion` para revisar el buzón) que consulte Mongo y llame al SDK de FCM es suficiente para la primera versión, y encaja en el mismo patrón `infrastructure/scheduler` que ya conoces.

## 5. El contrato entre los dos repos (sin fusionarlos)

Para que backend y front avancen en paralelo sin bloquearse el uno al otro (tú, Johan y Juan Eduardo trabajando en el mismo backlog de Jira), conviene fijar el contrato por escrito antes de programarlo: un archivo `openapi.yaml` (o incluso una tabla simple en el `README` de cada contexto) que diga, por endpoint, método, URL, JSON de entrada y de salida. Ese archivo puede vivir en cualquiera de los dos repos (yo lo pondría en el backend, porque es quien define la forma real de los datos) — no implica fusionar código, es documentación de la frontera entre los dos sistemas, igual que ya documentas HU-01 en `src/contexts/ingestion/README.md`.

## 6. Orden sugerido, ligado a lo que ya existe

1. Levantar `src/infrastructure/http/server.ts` con Express/Fastify y **un único endpoint de salud** (`GET /health`) para validar que el server corre y que `check-architecture` sigue en verde.
2. Exponer lectura de **convocatorias** (el caso más simple: ya hay datos de `ingestion`, no depende de auth ni de moderación) vía `GET /convocatorias`.
3. En el front, agregar Retrofit + `HttpConvocatoriasRepository` y cambiar esa única línea en `AppContainer` — validar en el emulador contra el backend corriendo en local (`10.0.2.2`).
4. Repetir el patrón para prácticas y noticias.
5. Agregar el contexto de identidad/autenticación antes de exponer escritura en el foro.
6. Notificaciones push al final, porque depende de que ya existan convocatorias reales con fecha de cierre confiable.

Con esto los dos proyectos siguen exactamente como los separaste desde el principio — cada uno en su propia carpeta, cada uno con su propio ciclo de vida — y el "front preliminar" que ya tienes no se reescribe: se le conecta un cable.
