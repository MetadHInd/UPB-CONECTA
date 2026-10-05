# Contexto de perfil del estudiante (HU-37)

Trazabilidad: RF-59, RF-60, RNF-15, RNF-20.

## Alcance

El estudiante consulta su nombre, correo institucional, programa y semestre tal como los provee el directorio, y puede actualizar **solo** su semestre en curso para que el feed se segmente según su situación académica real.

Este backend entrega:

- `StudentProfile`: entidad persistida con la frontera solo lectura / editable modelada en el tipo.
- `SyncStudentProfileFromDirectory`: sincronización con el directorio en cada autenticación, sin pisar un semestre editado.
- `ViewStudentProfile`: vista del perfil, con `readOnly` y `editable` ya separados por el dominio y el aviso de que la corrección se tramita ante la Universidad.
- `UpdateStudentProfile`: actualización del semestre con validación en el servidor.
- La integración del semestre en la segmentación del feed (`targeting` + `feed`).

**No hay pantallas ni capa HTTP en este repositorio.** Mostrar el perfil y el texto del aviso es trabajo del cliente Android. Aquí el aviso existe como dato de dominio (`DIRECTORY_CORRECTION_NOTICE`), y la decisión de qué es editable no se deja a la interfaz.

## Ubicación: contexto propio `profile/`

Se creó `src/contexts/profile/` en lugar de meterlo en `identity`:

- `identity` autentica contra el directorio y emite sesiones; no persiste datos del estudiante. Si el perfil viviera ahí, `identity` pasaría a tener estado editable propio.
- Las dependencias van en un solo sentido. `identity` y `feed` **no importan nada de `profile`**. Cada uno declara un puerto de salida (`AuthenticatedProfileSyncPort` en `identity`, `StudentSegmentPort` en `feed`), y `profile` los implementa en `infrastructure/integration/`. Solo esa carpeta de infraestructura conoce los otros contextos. Dominio y aplicación de `profile` no importan nada de fuera.
- `IdentityProfile` no se duplica. `profile` define `DirectoryRecord`, que es estructuralmente compatible, y el adaptador `IdentityProfileSyncAdapter` copia campo a campo.

## Frontera solo lectura / editable (criterio 2)

Es una regla de dominio verificada en tres niveles:

1. **Compilación.** `StudentProfile.directory` es `DirectoryProjection { readonly email; readonly programId }`, y `semester` es `readonly`. `tests/profile/StudentProfile.test.ts` contiene asignaciones marcadas con `// @ts-expect-error`. Si alguien quita un `readonly`, la directiva queda sin error que esperar y **`npm run typecheck` falla**. Se comprobó con una mutación: quitar `readonly` del programa produce `TS2578: Unused '@ts-expect-error' directive`.
2. **Ejecución.** La entidad y su proyección están congeladas (`Object.freeze`). La única vía de cambio del estudiante es `withSemester`, que devuelve un perfil nuevo. Solo `syncedWith`, invocado por la sincronización, cambia los campos del directorio.
3. **Entrada sin tipo.** El cuerpo JSON de una petición futura no pasa por el compilador. `classifyProfileChanges` separa los campos del directorio (`name`, `email`, `program`, `programId`, `studentId`), los editables (`semester`) y los desconocidos. `UpdateStudentProfile` rechaza **la petición completa** si trae cualquier campo del directorio, con el error `read-only-field` y el mensaje `DIRECTORY_CORRECTION_NOTICE`. Una petición mixta no aplica "lo que sí se podía".

## Sincronización con el directorio

**Decisión:** la sincronización se ejecuta dentro de `AuthenticateStudent.execute()`, a través del puerto de salida `AuthenticatedProfileSyncPort`, declarado como dependencia **obligatoria** (`profileSync`).

- **Por qué dentro del login y no en un caso de uso aparte llamado después:** con un caso de uso aparte, sincronizar dependería de que cada punto de entrada futuro recuerde llamarlo. Olvidarlo en uno solo dejaría el feed segmentado con un programa viejo. Dentro del login ocurre en toda autenticación correcta, y solo en ellas.
- **Por qué obligatoria y no opcional:** por el mismo argumento que `sessions` en HU-45. Una dependencia opcional deja que un cableado incompleto funcione en silencio sin sincronizar. Las pruebas de sesión, que no observan el perfil, inyectan `ignoreProfileSync` de forma explícita.
- **Orden:** credenciales → `recordSuccess` → sincronización → emisión de sesión. Así el primer feed de la sesión ya usa programa y semestre vigentes.
- **Si la sincronización falla** (por ejemplo, Mongo caído), el error se propaga, el login falla y no se abre sesión (prueba: `si el perfil no se puede sincronizar...`). Es coherente con HU-45, cuyas sesiones también dependen de Mongo. Tampoco cuenta como credencial inválida para el rate limiter.

Reglas de la sincronización (`StudentProfile.syncedWith`):

- `email` y el programa siempre se toman del directorio; el programa se guarda traducido a id del catálogo (ver corrección del bug 3).
- El semestre tiene un origen (`semesterSource`). Si es `directory`, sigue al directorio en cada login: un estudiante que nunca editó avanza cuando el directorio avanza. Si es `student`, **se conserva** lo que editó el estudiante.
- Un semestre del directorio fuera de rango no bloquea el login: queda desconocido (`null`).
- Una vez editado, el semestre del estudiante prevalece siempre sobre el del directorio. Si más adelante se quiere que un cambio del directorio "gane" (por ejemplo, al cambiar de periodo), hará falta guardar el semestre del directorio en el momento de la edición. Queda fuera de alcance.

**Concurrencia.** Un login que sincroniza y una edición simultánea podrían pisarse (leer, modificar, escribir). El repositorio usa concurrencia optimista con `version`: `save` solo escribe si la versión almacenada no cambió, y los casos de uso releen y reaplican hasta 3 veces (`saveWithRetry`). La regla de negocio (preservar el semestre editado) sigue en el dominio y no en un update condicional de Mongo. Si el conflicto persiste, la sincronización lanza `ProfileSyncConflictError` y la edición devuelve `concurrent-modification`; ninguna sobrescribe.

## Semestre: `SemesterNumber` (criterio 5)

- Value object que valida en su fábrica: entero, dentro de `[min, max]`. Recibe `unknown` porque el valor llega del cliente: `"6"` en texto se rechaza.
- **Rango:** el mínimo es fijo en 1 (no existe el semestre 0). El máximo es **configurable** con `PROFILE_SEMESTER_MAX` (por defecto **12**, para cubrir pregrados de 10 semestres y Medicina con internado), porque depende de la oferta académica y no del código.
- El rechazo devuelve `semester-out-of-range`, el mensaje `El semestre debe ser un número entero entre 1 y 12.` y `allowedRange: { min, max }`, para que el cliente muestre el rango válido.
- No hay un máximo por programa. Si se necesita, el lugar natural es el catálogo `config/program-catalog.json`.

## Semestre en la segmentación del feed (criterio 4)

**Decisión: filtro de semestre ortogonal a `ProgramTargeting`**, no un caso nuevo de la unión.

- Una convocatoria real combina ambas dimensiones ("electivas para 6° en adelante de cualquier programa de la facultad"). Un caso nuevo `programs-with-semester` no cubriría facultad + semestre ni toda la comunidad + semestre sin multiplicar variantes.
- `targeting/domain/value-objects/SemesterRange.ts`: `{ min, max | null }`, donde `max: null` significa "en adelante" y los límites son inclusivos.
- `ProgramTargetingRecord.semesterRange?: SemesterRange | null`. Si falta o es `null`, no hay restricción. Los registros anteriores a HU-37 se leen sin restricción. `MongoProgramTargetingRepository` lo persiste.
- `FeedVisibilityPolicy.isVisible(targeting, student, semesters)` exige programa **y** semestre. Un estudiante sin semestre conocido no ve contenido dirigido por semestre (mismo criterio conservador que ya aplicaba a un programa ausente).
- `feed` recibe `StudentSegment { program?, semester? }` en lugar de `IdentityProfile`: solo lo que segmenta.

**Cómo llega el semestre editado al feed (criterio 3):** `GetStudentFeed.execute(email)` consulta el segmento del **perfil persistido** en cada llamada (`StudentSegmentPort`, implementado por `FeedStudentSegmentAdapter`). El semestre editado aplica en la siguiente carga del feed, sin volver a iniciar sesión. La capa HTTP futura debe usar `GetStudentFeed` con el sujeto de la sesión verificada (HU-45). Si llamara a `GetSegmentedFeed` con el `IdentityProfile` del login, usaría el semestre del directorio y perdería la edición.

## Minimización de datos (criterio 6)

El documento de `student_profiles` contiene exactamente `_id` (correo), `programId`, `semester`, `semesterSource`, `updatedAt` y `version`.

- **No se guarda el nombre.** No segmenta. La vista lo toma de los datos frescos del directorio de la autenticación en curso, no de una copia persistida que podría envejecer.
- **No se guarda `studentId`** ni ningún otro campo que el directorio agregue en el futuro. La proyección se copia campo a campo, nunca con `...record`, y hay una prueba que inyecta campos extra y verifica que no llegan ni a la entidad ni al documento.
- `semesterSource`, `updatedAt` y `version` no son datos personales: son metadatos necesarios para la regla de sincronización y la concurrencia.
- Consecuencia: `ViewStudentProfile` recibe el `IdentityProfile` de la autenticación. Mostrar el perfil más tarde sin volver a autenticarse exige que el cliente conserve lo que recibió en el login (almacenamiento del dispositivo, como ya indica HU-43), porque el directorio no se puede consultar sin credenciales.

## Configuración

| Variable | Por defecto | Descripción |
|---|---|---|
| `PROFILE_SEMESTER_MAX` | `12` | Semestre máximo admitido; el mínimo es 1. |

## Colección MongoDB

- `student_profiles`: `_id = email` normalizado; `programId` es el id del catálogo o `null`. Sin índices adicionales, porque todas las lecturas son por `_id`.

## Consumo por el planificador de avisos (HU-19/HU-20, contexto `notifications`)

`StudentProfileRepositoryPort` ganó `findAll(): Promise<readonly StudentProfile[]>`, agregado de forma aditiva (no rompe `findByEmail`/`save`): el planificador de avisos de `notifications` necesita poder listar estudiantes para cruzarlos contra el targeting de una convocatoria, algo que `profile` no necesitaba hasta que existió ese consumidor. `notifications` no importa nada de `profile` en su dominio: declara su propio puerto (`StudentDirectoryPort`, con `studentId`/`programId`) y lo implementa `ProfileStudentDirectoryAdapter` en su propia infraestructura, que sí depende de `StudentProfileRepositoryPort` y proyecta cada `StudentProfile` al tipo de `notifications` — mismo patrón de desacople que `ConsentStatusPort`/`ConsentStatusAdapter` (HU-44, `identity` → `consent`). Detalle completo en `src/contexts/notifications/README.md`, sección HU-19.

## Gaps conocidos (fuera de esta historia)

- **Nada produce todavía un `semesterRange` desde un correo real.** `ProgramTargetingResolver` (HU-07) no extrae semestres del texto, y además ni él ni `ProgramTargetingRepositoryPort.save` están conectados al flujo de ingesta en `src/`: hoy solo las pruebas guardan targeting. El mecanismo de HU-37 funciona de punta a punta en cuanto un registro tenga `semesterRange`, pero extraer el rango del texto ("de 6° semestre en adelante") es trabajo de una historia de clasificación o targeting.
- **Desajuste entre programa del directorio y catálogo: corregido** (ver la sección siguiente). Confirmado primero con `tests/regression/ProgramIdMismatch.test.ts`, que ahora es un `it` normal y pasa.
- No hay endpoint HTTP. La capa futura debe tomar el correo del sujeto de la sesión verificada, nunca del cuerpo de la petición.

## Corrección: programa del directorio → id del catálogo (bug 3)

Corrección técnica posterior a HU-37 (rama `correccion-bugs-integracion`), no una historia del backlog.

**Problema (confirmado con prueba).** `InMemoryIdentityProviderAdapter` entrega `program: 'Ingeniería de Sistemas'` (nombre), mientras que `ProgramTargetingResolver` y `FacultyProgramResolver` dirigen las convocatorias con ids del catálogo (`sistemas`). Ninguna convocatoria dirigida a un programa o a una facultad le llegaba a ningún estudiante. `tests/regression/ProgramIdMismatch.test.ts` usa piezas reales: adaptador en memoria sin registrar cuentas, `config/program-catalog.json` y el resolver de HU-07. Estaba marcada con `it.fails`; al cambiarla a `it` falló por la visibilidad (`['general']` en lugar de los tres ids), y con la corrección pasa.

**Dónde se traduce: al sincronizar el perfil.** `SyncStudentProfileFromDirectory` resuelve el programa mediante un puerto propio de `profile` (`ProgramCatalogPort`), implementado por `TargetingProgramCatalogAdapter` sobre el mismo catálogo del targeting. El perfil guarda **el id** en `DirectoryProjection.programId`, y el campo persistido pasó de `program` a `programId`, para que el tipo deje claro que ya no es texto del directorio. Se traduce en cada login, así que un programa que el catálogo agregue después queda reconocido en la siguiente autenticación.

**Sin suponer el contrato del directorio real.** `ProgramCatalogMatcher` (en `targeting`) acepta **el id o el nombre**, comparados con la normalización que ya usaba `ProgramTargetingResolver` (sin tildes, minúsculas, sin puntuación, espacios colapsados). Esa normalización se extrajo tal cual a `CatalogTextNormalization.ts`. Si el directorio real entrega ids, funciona; si entrega nombres, también. Si entrega códigos (por ejemplo SNIES), basta agregarlos al catálogo, sin cambiar el código. Se eligió esta normalización y no la de `FacultyProgramResolver` porque aquella solo pasa a minúsculas y no reconocería "Ingenieria" sin tilde frente a "Ingeniería".

**Programa no reconocido.** Si no hay coincidencia, o si es **ambigua** (dos programas con el mismo nombre normalizado), el perfil guarda `programId: null`. Consecuencias:
- el segmento no lleva programa y el feed muestra **solo contenido de toda la comunidad**, marcado como `incompleteProfile` (el mismo mecanismo de HU-12 para programa ausente);
- el login **no falla**;
- la vista expone `readOnly.programRecognized: false` sin ocultar el nombre que dio el directorio;
- el semestre editado se conserva.

Se prefirió esto a adivinar: un programa equivocado mostraría convocatorias ajenas, que es peor que mostrar solo las generales.

**Arnés.** `tests/profile/profileHarness.ts` sigue usando `program: 'sistemas'` para las pruebas de semestre; ahora pasa por la traducción como cualquier otro valor. `tests/profile/ProgramRecognition.test.ts` cubre nombre, no reconocido, ambigüedad y catálogo actualizado.

## Criterios de aceptación y pruebas

| # | Criterio | Pruebas |
|---|---|---|
| 1 | Ver nombre, correo, programa y semestre del directorio | `tests/profile/StudentProfileUseCases.test.ts` › criterio 1 (vista con datos frescos del directorio + semestre vigente; tras editar muestra ambos semestres; sin perfil persistido usa el directorio) |
| 2 | Datos del directorio de solo lectura, con aviso de trámite ante la Universidad | `tests/profile/StudentProfile.test.ts` › frontera (`@ts-expect-error` verificado por `tsc`, entidad congelada, `withSemester` como única vía, `classifyProfileChanges`); `StudentProfileUseCases.test.ts` › criterio 2 (rechazo con `DIRECTORY_CORRECTION_NOTICE`, petición mixta rechazada completa, campos desconocidos, sin cambios) |
| 3 | El semestre editado se persiste y aplica al feed en la siguiente sincronización | `StudentProfileUseCases.test.ts` › criterio 3 y sincronización (persistencia con origen `student`, re-login conserva la edición); `tests/feed/SemesterSegmentation.test.ts` › criterios 3 y 4; `tests/infrastructure/mongo/MongoStudentProfileRepository.integration.test.ts` › flujo completo |
| 4 | Con el semestre actualizado, el contenido dirigido por semestre cambia en consecuencia | `tests/feed/SemesterSegmentation.test.ts` (subir a 6 muestra "6° en adelante" con el programa fijo; bajar de 1 a 2 oculta "solo 1°"; re-login con el directorio en 5 mantiene la edición; política con facultad y toda la comunidad; semestre desconocido); mutación comprobada: ignorar el rango hace fallar 5 pruebas |
| 5 | Semestre fuera de rango rechazado indicando el rango válido | `StudentProfile.test.ts` › `SemesterNumber`; `StudentProfileUseCases.test.ts` › criterio 5 (0, 13, 4.5, `"6"`, `null`; rango configurado); `tests/profile/ProfileConfig.test.ts` |
| 6 | El perfil almacenado solo contiene lo necesario para segmentar | `StudentProfile.test.ts` › minimización (campos extra del directorio no llegan); `MongoStudentProfileRepository.integration.test.ts` › documento exacto sin nombre ni código |

También: concurrencia optimista (`StudentProfileUseCases.test.ts` › concurrencia y la prueba de integración con dos inserciones simultáneas) y persistencia de `semesterRange` (`MongoProgramTargetingRepository.integration.test.ts`).
