# Contexto del foro (HU-30, HU-35)

Trazabilidad: RF-46, RF-47, RNF-14. CU-03 pasos 1 y 2, excepción E2.

## Alcance

Foro donde toda publicación queda firmada con el nombre y el programa verificados del autor, organizado en temas que define el administrador.

El diseño exige que la verificación de rol y sanción ocurra en el servidor: "ocultar el botón en la interfaz no es control de acceso". Por eso toda la autorización de esta historia vive en este backend, como dominio y casos de uso puros, listos para que una capa HTTP futura los invoque. Igual que en HU-45, **no haber servidor HTTP no impide implementar la historia**: la capa HTTP solo traducirá peticiones y códigos de estado.

Se entrega:

| Pieza | Capa | Rol |
|---|---|---|
| `Topic`, `Post`, `ForumAuthor`, `Sanction` | Dominio | Entidades y reglas de contenido |
| `ForumAccessPolicy` | Dominio | Autorización pura: autor verificado, acceso al tema y sanción vigente |
| `TopicRepositoryPort`, `PostRepositoryPort`, `ForumAuthorRepositoryPort`, `SanctionStatusPort`, `ForumAccessAuditPort`, `ForumProgramCatalogPort`, `ForumIdGeneratorPort`, `ClockPort` | Puertos | |
| `CreatePost` | Aplicación | Publicar (criterios 1, 2, 4 y 6) |
| `ListTopics`, `ListTopicPosts` | Aplicación | Navegar temas y leer un tema (criterios 3 y 4) |
| `ManageTopics` | Aplicación | Crear, editar, restringir, retirar y reactivar temas (criterio 5) |
| `SeedDefaultTopics` + `DEFAULT_FORUM_TOPICS` | Aplicación / infraestructura | Temas iniciales, sembrados solo si faltan |
| `SyncForumAuthor` + `IdentityForumAuthorSyncAdapter` | Aplicación / integración | Autor verificado refrescado en cada login |
| Adaptadores en memoria y Mongo | Infraestructura | `forum_topics`, `forum_posts`, `forum_authors`, `forum_access_audit` |

## Qué queda explícitamente fuera

- **Moderación e imposición de sanciones.** En HU-30 solo existían la consulta (`SanctionStatusPort.findSanctions`) y el rechazo. **HU-35 ya las impone** por historial de infracciones y agregó el adaptador Mongo (`forum_sanctions`). Ver la sección HU-35 más abajo.
- **Roles de administrador.** `ManageTopics` no verifica quién lo invoca. Lo protegerá un control de acceso administrativo externo que no existe todavía. `performedBy` queda registrado en el tema (`updatedBy`) para trazabilidad, pero **no es una autorización**: la capa que llame a `ManageTopics` debe verificar el rol antes.
- **Capa HTTP e interfaz.** Los casos de uso reciben el correo del **sujeto de la sesión verificada** (HU-45), nunca un valor enviado por el cliente.
- Edición y borrado de publicaciones, respuestas o hilos, paginación y búsqueda: fuera de los criterios.

## Decisiones

### 1. Fuente de la autoría: registro propio del foro, alimentado por `IdentityProfile`

El prompt pedía reutilizar `IdentityProfile` (HU-43) o `StudentProfile` (HU-37). Se usa **`IdentityProfile`**, a través de un registro propio del foro (`ForumAuthor`):

- `StudentProfile` **no guarda el nombre**. HU-37 criterio 6 lo excluye porque no sirve para segmentar. Agregarlo rompería esa garantía y el objetivo de minimización de datos.
- `IdentityProfile` solo existe en el momento del login. Al publicar, la petición solo trae la sesión (el correo), y **el directorio no se puede volver a consultar sin la contraseña**.
- Solución: en cada autenticación, `AuthenticateStudent` ya envía los datos frescos del directorio por `AuthenticatedProfileSyncPort` (HU-37). El foro se suscribe a ese mismo puerto y guarda `ForumAuthor { email, name, programName, programId }`. El nombre se guarda **solo en el contexto que lo necesita**. `studentId`, semestre y cualquier campo futuro del directorio no llegan al foro, porque se copia campo a campo.
- `AuthenticateStudent` acepta un solo `profileSync`. Se agregó `FanOutProfileSync` en la infraestructura de `identity`, que invoca en orden a `profile` y a `forum`. Si uno falla, el login falla, igual que en HU-37. `identity` sigue sin importar nada de `profile` ni de `forum`.
- `programId` se traduce con `ProgramCatalogMatcher` de `targeting`, la misma traducción de nombre a id del catálogo que usa `profile` desde la corrección del bug 3. Cumple `ForumProgramCatalogPort` sin adaptador intermedio.

**Consecuencia:** quien tenga una sesión emitida antes de que existiera el foro no tendrá `ForumAuthor` hasta su siguiente login. Mientras tanto, publicar y leer responden `author-not-verified` con un mensaje que pide iniciar sesión de nuevo.

**Trade-off de minimización:** se guarda el nombre de todo estudiante que se autentica, aunque nunca use el foro. Una mejora posible es crear el `ForumAuthor` solo para quien aceptó las normas del foro (ver decisión 6).

### 2. Nunca anónimo ni bajo seudónimo (criterios 1 y 2)

- La autoría **no se recibe del cliente**. `CreatePost` recibe `authorEmail` (sujeto de la sesión) y toma nombre y programa de `ForumAuthor`. No existe ningún campo de "nombre para mostrar".
- Frontera en el tipo: `CreatePostInput` no tiene campos de identidad y `Post.author` solo se construye desde el autor verificado.
- Frontera en ejecución, para el cuerpo JSON sin tipo: si trae `alias`, `displayName`, `authorName`, `name`, `anonymous`, `pseudonym`, `program`, `email`, etc. (`IDENTITY_FIELDS`), se rechaza **la petición completa** con `identity-fields-not-allowed` y un mensaje que explica que las publicaciones se firman con los datos del directorio. Los campos desconocidos también se rechazan.
- Sin `ForumAuthor`, o con nombre vacío en el directorio, se rechaza con `author-not-verified`.
- La publicación guarda **una copia** de nombre y programa al publicar. Si el directorio cambia después, las publicaciones anteriores conservan la firma con que se hicieron.
- El correo del autor se guarda en la publicación (`author.email`) para trazabilidad y moderación, pero **la vista pública (`PostView`) solo expone nombre y programa**.

### 3. Temas como datos administrables (criterios 3 y 5)

- Mismo patrón que `PostProcessingRuleRepositoryPort` (HU-09): los casos de uso leen el repositorio en cada operación, sin caché, así que un cambio del administrador aplica en la siguiente petición.
- Los cuatro temas del criterio 3 (Académico, Compraventa entre estudiantes, Eventos, Espacio general) son **datos semilla** en `infrastructure/seed/defaultForumTopics.ts`, no un enum. `SeedDefaultTopics` solo inserta los que faltan (`create` idempotente por `_id`), así que volver a sembrar nunca pisa ediciones, restricciones ni retiros del administrador.
- Operaciones: `create`, `edit` (nombre y descripción; el id no cambia), `restrict` (liberar = restringir a toda la comunidad), `retire` y `reactivate`. El id se deriva del nombre al crear (`Semilleros de Sistemas` → `semilleros-de-sistemas`) y un duplicado se rechaza.
- Retirar **no borra** publicaciones: el tema deja de listarse y de admitir lecturas y publicaciones, y se puede reactivar.
- `ManageTopics` valida la restricción contra el catálogo institucional: rechaza programas o facultades que no existen.

### 4. Restricción por programa (criterio 4): reutiliza `ProgramTargeting`

- `Topic.restriction` **es** un `ProgramTargeting` (toda la comunidad, una facultad o un conjunto de programas). No se reinventó la semántica.
- La regla "¿este programa entra en este targeting?" estaba escrita dentro de `FeedVisibilityPolicy` (HU-12). Se extrajo a `targeting/domain/services/ProgramTargetingMembership.ts` (`targetingIncludesProgram`) y la usan **el feed y el foro**. El feed conserva exactamente su comportamiento y sus pruebas siguen verdes.
- "Acceder" incluye **leer** (`ListTopicPosts`) y **publicar** (`CreatePost`). Ambos rechazan y auditan. `ListTopics` omite los temas restringidos ajenos por comodidad, no como control de acceso.
- Un autor cuyo programa el catálogo no reconoce (`programId: null`) no entra a ningún tema restringido, pero sí a los abiertos.
- Un tema inexistente o retirado responde `topic-not-found` y **no se audita**, porque no es un intento sobre un tema restringido.

### 5. Auditoría: puerto propio del foro

Se evaluó reutilizar `SecurityAuditLogPort` (HU-45). Se descartó porque su evento está modelado para tokens (`tokenKind`, `TokenRejectionReason`, `chainId`); meter ahí un acceso a un tema obligaría a campos sin sentido o a acoplar el foro al vocabulario de la sesión. `ForumAccessAuditPort` registra `{ kind: 'topic-access-denied', operation: 'read' | 'publish', studentEmail, studentProgramId, topicId, occurredAt }`.

A diferencia de HU-45, **sí tiene adaptador Mongo** (`forum_access_audit`, append-only, con índices por estudiante y por tema), así que el criterio 4 se cumple también en producción.

### 6. Consentimiento de las normas del foro: evaluado, no implementado

`ConsentRecord` (HU-44) ya modela `'forum-guidelines'`. Exigirlo para publicar es una integración natural, pero **no se implementó**:
- ningún criterio de HU-30 lo exige, y agregar una precondición bloqueante cambiaría el flujo de CU-03 sin respaldo en la historia;
- falta la pieza que lo haría verificable: una fuente de la **versión vigente** de las normas del foro (`GetConsentStatus` necesita `currentVersion`, y hoy nadie la publica).

Queda como **gap pendiente**: cuando exista esa fuente, lo natural es sumar a `ForumAccessPolicy.decidePublication` un chequeo de consentimiento vigente, y crear el `ForumAuthor` solo para quien aceptó las normas (ver decisión 1).

### 7. Sanción (criterio 6)

- `Sanction { startsAt, endsAt }`. Si está **vigente** lo decide el dominio (`isSanctionActive`: `startsAt ≤ ahora < endsAt`), no el adaptador.
- Con varias vigentes, se informa la que termina más tarde.
- El mensaje da la fecha y hora de fin en hora de Colombia (`es-CO`, `America/Bogota`), por ejemplo "Tienes una sanción activa en el foro hasta el 30 de septiembre de 2026, 5:00 p. m. (hora de Colombia)". El resultado incluye además `sanctionEndsAt` como `Date` para que el cliente la formatee a su manera.
- La sanción impide **publicar**, no leer.
- Orden de evaluación: autor verificado → acceso al tema → sanción. La restricción va antes que la sanción para que un intento sobre un tema ajeno quede auditado aunque el estudiante además esté sancionado.

### 8. Con qué programa se evalúa la restricción, y qué pasa con lo ya publicado

**Regla:** la restricción de un tema se evalúa **en el momento de cada operación, con el programa del `ForumAuthor` en ese momento**. Las publicaciones ya hechas **no se reevalúan nunca**.

- **Al publicar:** se usa el `programId` del autor **según su último login**, no una consulta en vivo al directorio, que no es posible sin la contraseña. Si la restricción lo admite, la publicación se guarda con la copia del programa con que se autorizó (`author.programId` y `author.programName`).
- **Si el autor cambia de programa después de publicar:** su publicación **se queda** en el tema restringido, con la firma original, y los estudiantes del programa la siguen viendo. No se retira ni se marca: cuando se publicó, cumplía la restricción. Desde su siguiente login, el autor ya no puede publicar ni leer en ese tema, y esos intentos se auditan con su programa nuevo.
- **Al leer:** se evalúa el programa **vigente del lector** en cada lectura, no el de los autores.
- **Si el administrador endurece la restricción de un tema:** las publicaciones existentes tampoco se retiran; solo cambia quién puede leer y publicar desde ese momento.

**Por qué no se reevalúa:** la copia firmada es el registro de lo que el directorio decía cuando el estudiante publicó (criterio 1). Retirar publicaciones por un cambio posterior de programa borraría contenido legítimo sin que nadie lo haya revisado. Si una publicación debe salir, es una decisión de moderación (fuera de alcance), que cuenta con la copia del programa y el índice `idx_author_email` para encontrarla.

**Gap: el "último login" puede quedar desactualizado por mucho tiempo.** La renovación de sesión de HU-45 es deslizante y sin tope absoluto, y renovar **no** vuelve a sincronizar con el directorio (solo lo hace `AuthenticateStudent`). Un estudiante que abre la app al menos una vez dentro de `SESSION_REFRESH_TOKEN_TTL_SECONDS` (30 días por defecto) no vuelve a iniciar sesión nunca, y el foro conserva el programa que tenía en su último login. Ese es el escenario real en que una publicación **sí** entra a un tema que el directorio ya no le permitiría: el cambio de programa ocurrió antes de publicar, pero el foro no lo conocía (prueba: `mientras no vuelva a iniciar sesión, el foro usa el programa de su último login`). Hoy no hay forma de detectarlo después, porque la copia guarda el programa con que se autorizó y no el que tenía el directorio.

El mismo gap afecta al perfil de HU-37 (el semestre y el programa del feed). Las mitigaciones, ambas fuera de esta historia:
1. un tope absoluto de vida de la cadena de sesión, que ya está listado como pendiente en el README de `identity`;
2. resincronizar con el directorio al renovar, lo que exige un directorio consultable sin la contraseña del estudiante.

Pruebas: `tests/forum/ForumUseCases.test.ts` › criterio 4 › "cambios de programa después de publicar" (cinco casos). Son **pruebas de caracterización**: pasaron al escribirlas porque fijan el comportamiento que ya existía, no uno nuevo.

## Qué se reutilizó de otros contextos

| De | Qué | Cómo |
|---|---|---|
| `identity` (HU-43) | `IdentityProfile` | Fuente del autor verificado, vía `AuthenticatedProfileSyncPort` |
| `identity` (HU-37) | `AuthenticatedProfileSyncPort` | Se agregó `FanOutProfileSync` para servir a `profile` y `forum` |
| `targeting` (HU-07) | `ProgramTargeting`, `FacultyProgramResolver`, catálogo | Restricción de temas y validación en `ManageTopics` |
| `targeting` (bug 3) | `ProgramCatalogMatcher` | Traducir el programa del directorio a id del catálogo |
| `feed` (HU-12) | Regla de pertenencia al targeting | Extraída a `targetingIncludesProgram` y compartida |
| `classification` (HU-09) | Patrón de repositorio administrable | `TopicRepositoryPort` |
| `hardening` (HU-47) | `neutralizeHtml` | `CreatePost.execute()` neutraliza `title`/`text` antes de persistir (criterio 7, scripts embebidos) — ver README de `hardening` |

No se duplicó `IdentityProfile`, `StudentProfile` ni `ProgramTargeting`. `ForumAuthor` no es una copia de `IdentityProfile`: es la proyección con propósito del foro, con solo nombre, programa e id de programa.

## Colecciones MongoDB

- `forum_topics`: `_id = id` del tema. Índice `idx_status_name` `{ status: 1, name: 1 }`.
- `forum_posts`: `_id` = UUID. Índices `idx_topic_published` `{ topicId: 1, publishedAt: -1 }` e `idx_author_email` `{ 'author.email': 1 }`, este último para moderación.
- `forum_authors`: `_id = email` normalizado; solo lecturas por `_id`.
- `forum_access_audit`: append-only. Índices `idx_student_occurred` e `idx_topic_occurred`.

Los índices se crean con `ensureIndexes(db)` de cada adaptador. `main.ts` hoy solo compone la ingesta; el foro se cableará con la capa HTTP.

## Criterios de aceptación y pruebas

| # | Criterio | Pruebas |
|---|---|---|
| 1 | La publicación queda asociada al nombre y programa del directorio | `tests/forum/ForumUseCases.test.ts` › criterio 1 (el login sincroniza al autor y la publicación lo firma; un cambio del directorio aplica tras el siguiente login y las publicaciones anteriores conservan su firma; la vista no expone el correo); `tests/infrastructure/mongo/MongoForum.integration.test.ts` › flujo completo |
| 2 | No se admiten publicaciones anónimas ni bajo seudónimo | `ForumUseCases.test.ts` › criterio 2 (siete campos de identidad rechazados sin guardar nada; autor no verificado; nombre vacío en el directorio; contenido inválido; campos desconocidos); `tests/forum/ForumAccessPolicy.test.ts` › anónimo |
| 3 | Temas definidos por el administrador, entre ellos académico, compraventa, eventos y espacio general | `ForumUseCases.test.ts` › criterio 3 (siembra de los cuatro; resiembra idempotente sin pisar ediciones; listado solo de temas activos y accesibles) |
| 4 | Tema restringido: el servidor rechaza a otro programa y registra el intento | `ForumUseCases.test.ts` › criterio 4 (publicar y leer rechazados y auditados; el propio programa sin auditoría; facultad; programa no reconocido; inexistente o retirado sin auditoría; cambios de programa después de publicar, ver decisión 8); `ForumAccessPolicy.test.ts` › acceso; `MongoForum.integration.test.ts` (auditoría append-only y flujo) |
| 5 | El administrador crea, edita, restringe y retira temas sin desarrollo | `ForumUseCases.test.ts` › criterio 5 (crear, editar, restringir y liberar con efecto inmediato, retirar conservando publicaciones y reactivar; validaciones y tema inexistente); `MongoForum.integration.test.ts` › `MongoTopicRepository` |
| 6 | Sanción activa: rechazo informando la fecha de fin | `ForumUseCases.test.ts` › criterio 6 (mensaje con la fecha y `sanctionEndsAt`; vuelve a publicar al terminar; puede leer; sin sanción por defecto); `ForumAccessPolicy.test.ts` (vigencia, varias sanciones, terminada o futura, orden frente a la restricción) |

Mutaciones comprobadas: aceptar campos de identidad hace fallar 7 pruebas, quitar la auditoría hace fallar 2, e ignorar las sanciones hace fallar 4.

## HU-55 (SCRUM-67) — rendimiento y resiliencia (criterios 2 y 6)

- **Criterio 2** (20.000 documentos, tiempos apoyados en índices): `MongoPostRepository.findByTopic` ya usaba `idx_topic_published` `{ topicId: 1, publishedAt: -1 }` antes de esta historia — no hizo falta ningún cambio aquí. `tests/performance/FeedAndForumThroughput.test.ts` lo confirma con evidencia (no lo asume): siembra 20.000 publicaciones (8.000 en un mismo tema "caliente") contra MongoDB real y mide `findByTopic` sobre ese tema en ~219 ms, muy por debajo del presupuesto de 2 segundos. El problema de rendimiento real de esta historia estaba en `feed`, no en `forum` — detalle en su README.
- **Criterio 6** (ninguna interrupción pierde una publicación de un estudiante): `CreatePost.execute` termina con `await posts.save(post)`, y `MongoPostRepository.save` usa `insertOne` (escritura reconocida por defecto: la promesa solo resuelve cuando MongoDB confirmó la escritura). No se encontró ningún caso real de pérdida (sin `insertMany` sin `ordered`, sin escritura fire-and-forget, sin buffer en memoria antes de persistir), así que no hizo falta código nuevo. `tests/forum/CreatePost.resilience.test.ts` demuestra la garantía existente contra MongoDB real: guarda una publicación, descarta la instancia que la escribió (simulando que el proceso cae justo después de la confirmación de Mongo) y la vuelve a encontrar con una conexión y un repositorio completamente nuevos.

## HU-35 (SCRUM-47): sanciones graduales e historial de moderación

Trazabilidad: RF-55, RF-56, RNF-18, RNF-33. CU-03 flujo alternativo C, excepción E2. Entregable asociado: Normas de Convivencia del foro (Project Charter, entregable técnico 3).

### Alcance

El sistema aplica advertencia, suspensión temporal y suspensión prolongada según el historial de infracciones del estudiante, y el administrador de contenido consulta ese historial completo, revoca sanciones improcedentes y ajusta los umbrales. Igual que en HU-30, no hay capa HTTP ni interfaz: se entregan dominio, casos de uso y adaptadores, listos para que la capa HTTP los invoque.

| Pieza | Capa | Rol |
|---|---|---|
| `Infraction`, `InfractionOutcome` | Dominio | Resultado de moderar un contenido: `retained` o `blocked`, con copia del contenido, motivo y quién lo detectó |
| `SanctionRecord`, `SanctionLevel`, `sanctionStatus`, `activeSanctionEnd` | Dominio | Sanción impuesta, sus niveles y su vigencia (amplía `Sanction` de HU-30) |
| `SanctionThresholds` | Dominio (value object) | Umbrales y duraciones validados; por defecto 1 / 3 (7 días) / 5 (30 días), ventana de 180 días |
| `SanctionPolicy` | Dominio (servicio) | Estados (`none` → `warning` → `temporary-suspension` → `extended-suspension`) y transiciones explícitas (`transition`) |
| `SanctionMessages` | Dominio (servicio) | Motivo, duración y fecha de fin en hora de Colombia, compartidos con `CreatePost` |
| `InfractionRepositoryPort`, `SanctionRepositoryPort` (extiende `SanctionStatusPort`), `SanctionThresholdsRepositoryPort`, `SanctionNotificationPort`, `SanctionAuditPort` | Puertos | |
| `RecordInfraction` | Aplicación | Registra la infracción e impone la sanción que corresponda (criterios 1 y 2) |
| `GetModerationHistory` | Aplicación | Historial por estudiante (criterio 5) |
| `RevokeSanction` | Aplicación | Revocación auditada (criterio 6) |
| `ManageSanctionThresholds` | Aplicación | Consultar y ajustar umbrales (criterio 7) |
| Adaptadores en memoria y Mongo | Infraestructura | `forum_infractions`, `forum_sanctions`, `forum_sanction_thresholds`, `forum_sanction_audit`, `forum_sanction_notices` |

### Decisiones

**1. En `forum`, no en `moderation`.** El contexto `moderation` (HU-49) es la cola de revisión de convocatorias: mensajes en cuarentena y clasificaciones pendientes. Las sanciones son sobre la participación en el foro, y el foro ya era dueño de `Sanction` y `SanctionStatusPort`. `SanctionRepositoryPort` **extiende** `SanctionStatusPort`, así que el mismo almacén que guarda una sanción es el que `CreatePost` consulta: una sanción impuesta aplica en la siguiente publicación sin copiarla a ningún lado.

**2. Qué computa para la gradualidad.** Solo cuentan las infracciones **bloqueadas** (`blocked`) dentro de la ventana (`countingWindowDays`, 180 días por defecto). Un contenido **retenido** (`retained`) sin decisión aparece en el historial pero no sanciona, porque una sanción por algo que nadie confirmó no se podría sustentar. Si luego se bloquea, `RecordInfraction` lo actualiza (`escalated`) y desde ese momento cuenta. Hay una infracción por contenido (`_id = kind:id`): un reintento del moderador responde `unchanged` y no cuenta dos veces.

**3. Estados y transiciones explícitas.** El diseño de la historia pide `SanctionPolicy` con estados y transiciones explícitas. El escalón sale del conteo (`standingFor`) y `transition(anterior, actual)` decide:
- se sanciona solo al **cambiar de escalón**: con los valores por defecto, la 2.ª y la 4.ª infracción no generan sanción nueva;
- una vez en el último escalón, **cada reincidencia** vuelve a suspender de forma prolongada;
- si el administrador baja los umbrales y una infracción salta más de un escalón, se aplica **el escalón alcanzado**, no el siguiente.

**4. La advertencia no suspende.** Se guarda como sanción con intervalo vacío (`endsAt = startsAt`). `isSanctionActive` nunca la considera vigente, así que no bloquea publicar, pero queda en el historial y se notifica.

**5. El restablecimiento es automático porque la vigencia se calcula (criterio 4).** Nadie "levanta" una sanción. `isSanctionActive` compara con el reloj en cada publicación, así que al cumplirse `endsAt` el estudiante vuelve a publicar sin proceso programado ni intervención manual.

**6. Revocar no borra (criterio 6).** La sanción queda en el historial con `revocation { revokedBy, reason, revokedAt }` y además en la auditoría append-only (`forum_sanction_audit`). Deja de aplicar desde `revokedAt`. **La infracción que la disparó deja de computar**: si el administrador juzgó improcedente la sanción, la evidencia que la sostuvo no puede empujar la siguiente. Las demás infracciones siguen contando. El motivo es obligatorio y una sanción ya revocada no se vuelve a revocar.

**7. Umbrales como dato (criterio 7).** Mismo patrón que `ReviewThreshold` (HU-10). `RecordInfraction` los lee en cada infracción, sin caché. `SanctionThresholds.of` rechaza valores no enteros o no positivos, niveles que no crecen y una suspensión prolongada que no dure más que la temporal. El adaptador Mongo vuelve a validar al leer, para que un documento editado a mano no deje umbrales incoherentes. Un ajuste **no reevalúa sanciones ya impuestas**: cada una se sustentó con los umbrales vigentes cuando se impuso, y el cambio queda auditado (`thresholds-changed`, con los valores anterior y nuevo).

**8. Avisos (criterio 2): bandeja persistente, no canal de entrega.** No existe todavía un push del foro ni un canal de avisos a administradores (el mismo gap que `AdminAlertPort` de HU-10). `SanctionNotificationPort` declara el contrato. En producción, `MongoSanctionNoticeOutbox` guarda cada aviso en `forum_sanction_notices` con `recipient` (el correo del estudiante o `content-admins`) y `deliveredAt: null`, para que el canal futuro lo consuma sin perder ninguno. El aviso al estudiante incluye el motivo, la duración legible ("7 días") y la fecha de fin.

**9. Copia del contenido en la infracción.** Un contenido bloqueado antes de publicarse (moderación previa, HU-31) nunca llega a `forum_posts`. Sin una copia, el historial no podría mostrar qué se bloqueó.

### Autorización (HU-46)

`GetModerationHistory`, `RevokeSanction` y `ManageSanctionThresholds` están declaradas en `config/protected-operations.json` con rol `content-admin`. `scripts/check-declared-authorization.mjs` ganó el verbo `Revoke` en `ADMIN_VERB_PATTERN`, igual que HU-49 agregó `Discard`. `RecordInfraction` **no** se declara: no es una operación HTTP, sino el puerto de entrada que invocará la moderación (HU-31 automática, HU-34 por reportes).

### Dependencias y pendientes

- **HU-34 alimenta el historial; HU-31 ya lo hace (desde `CreatePost`, ver contexto `moderation`).** En Jira, HU-35 está bloqueada por HU-34. La política y el historial se implementaron sin esperarla, porque `RecordInfraction` es el contrato que esas historias deben invocar al retener o bloquear un contenido. Hasta que existan, en producción nadie genera infracciones.
- **Comentar (criterio 3).** Los comentarios son HU-33 y todavía no existen. El rechazo al publicar ya funciona con las sanciones reales. `CreateComment` debe reutilizar `SanctionStatusPort` y `activeSanctionEnd`/`formatSanctionEnd` para rechazar con la misma fecha.
- **Contenido retenido que se libera.** Si la moderación decide que un contenido retenido no infringe nada, hoy queda como `retained` en el historial, sin computar. Modelar esa liberación corresponde a HU-31/HU-52.
- **Entrega de avisos.** Falta el canal que consuma `forum_sanction_notices`.
- **Apelación por el estudiante.** Fuera de los criterios: la revocación es del administrador.

### Colecciones MongoDB

- `forum_infractions`: `_id = kind:id` del contenido. Índice `idx_student_occurred` `{ studentEmail: 1, occurredAt: -1 }`.
- `forum_sanctions`: `_id` = UUID. Índice `idx_student_imposed` `{ studentEmail: 1, imposedAt: -1 }`, que sirve a `CreatePost` y al historial.
- `forum_sanction_thresholds`: un solo documento (`_id: 'current'`). Sin él rigen los valores por defecto.
- `forum_sanction_audit`: append-only. Índices `idx_student_occurred` e `idx_performer_occurred`.
- `forum_sanction_notices`: bandeja de avisos. Índice `idx_recipient_pending` `{ recipient: 1, deliveredAt: 1 }`.

### Criterios de aceptación y pruebas

| # | Criterio | Pruebas |
|---|---|---|
| 1 | Al alcanzar cada umbral se aplica advertencia, suspensión temporal o prolongada | `tests/forum/ModerationSanctions.test.ts` › criterio 1 (secuencia 1-5, retenido vs. bloqueado sin doble conteo, validaciones, dueño del contenido); `tests/forum/SanctionPolicy.test.ts` › criterio 1 y "qué infracciones computan" |
| 2 | El administrador es notificado y el usuario recibe motivo y duración | `ModerationSanctions.test.ts` › criterio 2; `MongoForumSanctions.integration.test.ts` › bandeja |
| 3 | Con sanción activa se rechaza la operación informando la fecha de fin | `ModerationSanctions.test.ts` › criterio 3; `ForumUseCases.test.ts` › criterio 6 de HU-30; `MongoForumSanctions.integration.test.ts` › flujo completo |
| 4 | Al vencer el plazo, la facultad se restablece sola | `ModerationSanctions.test.ts` › criterio 4; `SanctionPolicy.test.ts` › vigencia |
| 5 | Historial con contenidos retenidos, bloqueados y sanciones con fecha y motivo | `ModerationSanctions.test.ts` › criterio 5 |
| 6 | La revocación queda auditada con el administrador | `ModerationSanctions.test.ts` › criterio 6; `SanctionPolicy.test.ts` (revocada deja de estar vigente y de computar) |
| 7 | El administrador ajusta los umbrales sin desarrollo | `ModerationSanctions.test.ts` › criterio 7; `SanctionPolicy.test.ts` › criterio 7; `MongoForumSanctions.integration.test.ts` › umbrales |

Mutaciones comprobadas: quitar la supresión entre umbrales hace fallar 6 pruebas; no anular la infracción de una sanción revocada, 2; computar lo retenido, 2; ignorar la revocación en la vigencia, 2; no avisar a los administradores, 3.
