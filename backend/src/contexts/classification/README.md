# UPB Conecta, contexto de clasificación

> Documentación específica de este contexto acotado. Para la visión general del proyecto y la arquitectura, ver el [README raíz](../../../README.md).

Implementación de la historia **HU-06**: clasificación de mensajes institucionales. Trazabilidad: **RF-09, RNF-42. CU-01 paso 6, excepción E3**.

## Alcance

Este contexto crea el catálogo de categorías del dominio, explora el puerto de salida `ClassificationPort.classify(message)` y modela tanto el almacenamiento de resultados como la cola de reintento cuando el proveedor no responde.

## Catálogo de dominio

Se declara como enumeración del dominio en `src/contexts/classification/domain/value-objects/MessageCategory.ts`:

- convocatoria con plazo
- evento
- beca
- movilidad
- curso de idiomas
- práctica
- boletín informativo

Este catálogo se usa como único origen de verdad para asignar la categoría y para validar que el resultado final del clasificador sea una de esas 7 opciones.

## Puertos y adaptadores

- `ClassificationPort`: contrato del proveedor de IA. La firma usa el tipo ya existente `InstitutionalMessage` del contexto de ingesta para no duplicar modelos paralelos.
- `ClassificationResultRepositoryPort`: persiste la categoría propuesta, la definitiva y la bandera del falso positivo del piloto.
- `ClassificationRetryQueuePort`: guarda mensajes normales sin clasificar cuando la llamada al proveedor falla.

### Adaptador en memoria

`InMemoryClassificationAdapter` usa reglas simples sobre asunto y cuerpo para devolver una categoría válida. Es un stub explícito y documentado para pruebas y para escenarios de integración, que cumple con la restricción del repositorio: no hay un proveedor real de IA ni una API disponible en este entorno.

### Adaptador Mongo

`MongoClassificationRetryQueue` y `MongoClassificationResultRepository` siguen el mismo patrón que el resto de repositorios del proyecto: manteniendo persistencia real en MongoDB y capas desacopladas del dominio.

## Comportamiento de la integración

- Si el proveedor responde, el caso de uso `ClassifyInstitutionalMessage` persiste el resultado con las dos categorías (`proposedCategory` y `finalCategory`) y la bandera de falso positivo.
- Si el proveedor falla, el documento normalizado se conserva tal cual y se registra en la cola de reintento de clasificación, sin marcarlo como publicado ni listo para feed.
- La diferencia entre categoría propuesta y definitiva queda explícita en el modelo para soportar revisión o calibración futura sin cambiar el contrato de persistencia.

## Diferido explícitamente

- Proveedor real de IA: no existe API ni acceso ni credenciales en este repositorio; se deja un adaptador en memoria como stub documentado.
- Métrica de HU-10: la evaluación del clasificador y la medición de precisión sobre la clase de interés queda fuera de este alcance, según la propia historia. **Actualización:** el mecanismo de cálculo ya existe — ver la sección HU-10 más abajo.

## Criterios de aceptación y pruebas (HU-06)

| Criterio | Descripción | Prueba correspondiente |
|---|---|---|
| 1 | Exactamente una categoría válida para un mensaje normalizado | `tests/classification/ClassificationFlow.test.ts` (`asigna exactamente una categoria valida a un mensaje normalizado`) |
| 2 | Error del proveedor -> se guarda en la cola de reintento y no se publica | `tests/classification/ClassificationFlow.test.ts` (`guarda el mensaje sin clasificar en la cola de reintento cuando falla el servicio`) |
| 3 | Se conservan la propuesta y la definitiva en el resultado persistido | `tests/classification/ClassificationFlow.test.ts` + `tests/infrastructure/mongo/MongoClassificationResultRepository.integration.test.ts` |
| 4 | El falso positivo del piloto queda explícitamente registrado | `tests/classification/ClassificationFlow.test.ts` (`conserva la categoria propuesta y la definitiva y registra el falso positivo del piloto`) |
| 5 | La persistencia real del resultado y la cola de reintento funciona en Mongo | `tests/infrastructure/mongo/MongoClassificationResultRepository.integration.test.ts`, `tests/infrastructure/mongo/MongoClassificationRetryQueue.integration.test.ts` |
| 6 | El dominio de clasificación queda desacoplado de la infraestructura y la arquitectura sigue respetada | `tests/infrastructure/check-architecture.test.ts` + `npm run check:architecture` |

## HU-09 — reglas de posprocesamiento sobre la clasificación (RF-13, RF-14, RNF-28. CU-01 paso 7)

> **Nota sobre el número de historia**: el desarrollador confirmó que esta
> historia corresponde a **HU-09**, pero esa confirmación viene de Jira, no
> del repositorio. A diferencia de HU-06, HU-12 y HU-43, este número no
> aparecía citado en ningún comentario existente antes de esta historia.

### Alcance

Después de que `ClassificationPort.classify(message)` propone una categoría,
un conjunto de reglas configurables por un administrador de contenido —
declaradas como **datos**, no como código — pueden **confirmar**, **corregir**
o **descartar** esa propuesta, evaluadas sobre el remitente y el asunto del
mensaje. El objetivo es evitar que, por ejemplo, un boletín informativo se
promueva por error a convocatoria con plazo, y permitir corregir el
comportamiento del sistema sin depender del equipo de desarrollo.

No se implementa ninguna interfaz de administración (UI): el backend no
expone HTTP todavía. Se deja el puerto de repositorio y los casos de uso
listos para que una capa de administración futura los consuma directamente.
Tampoco se implementa HU-10 (métrica del clasificador): la mejora de
precisión que esta historia persigue se mide con esa métrica, fuera de este
alcance. **Actualización:** implementada después — ver la sección HU-10.

### Diseño: Chain of Responsibility + Specification

- **Condición** (`domain/rules/PostProcessingRuleData.ts`, tipo
  `RuleConditionData`): "¿aplica esta regla a este mensaje?". Se modela con el
  patrón **Specification** (`domain/rules/Specification.ts`): cada condición
  hoja (`sender-matches`, `subject-matches`) se compila a una expresión
  regular insensible a mayúsculas evaluada sobre `InstitutionalMessage.sender`
  o `.subject`; `and`/`or`/`not` (`domain/rules/RuleConditionSpecification.ts`)
  componen condiciones simples en una más compleja. Un patrón de regex
  inválido no rompe la clasificación de todo el mensaje: esa especificación
  simplemente nunca coincide, como si la regla no existiera.
- **Acción** (`RuleActionData`): qué hacer si la condición se cumple —
  `confirm`, `correct` (a una `MessageCategory` concreta) o `discard`.
- **Regla como dato** (`PostProcessingRuleData`): `{ id, precedence, active,
  condition, action, description? }`, serializable a JSON. No existe una
  subclase de TypeScript por regla — la cadena se construye en tiempo de
  ejecución a partir de estos datos (`buildPostProcessingChain` en
  `domain/rules/PostProcessingRuleChain.ts`), leídos frescos en cada
  ejecución desde `PostProcessingRuleRepositoryPort.findActiveRules()`, nunca
  cacheados en memoria del proceso. Así, agregar, editar o desactivar una
  regla aplica a la siguiente ejecución de ingesta sin redespliegue
  (criterio 5).
- **Precedencia y determinismo (criterio 4)**: `precedence` es un número
  explícito en el dato de la regla — **un número menor se evalúa primero**.
  La cadena resuelve con la primera regla activa que coincide y se detiene
  ahí (Chain of Responsibility real, no un `if/else`). Ante empate de
  precedencia, se desempata por `id` ascendente, para que el resultado no
  dependa del orden en que el repositorio devuelva las reglas. Ver
  `tests/classification/PostProcessingRuleChain.test.ts` (pruebas con 3
  reglas en competencia, leídas en distintos órdenes, y con empate de
  precedencia).

### Decisión: qué significa "descartar" la clasificación

Los criterios 1 y 2 mencionan "descartar" además de "confirmar" o "corregir",
pero `ClassificationResult` exige siempre una `finalCategory` válida (no
admite un estado nulo). Se evaluaron dos lecturas:

- Lectura A: forzar una categoría por defecto explícita (ej. "boletín
  informativo").
- **Lectura B (la implementada)**: tratar el mensaje como "no clasificado con
  confianza" y enviarlo a la misma cola de reintento
  (`ClassificationRetryQueuePort`) que ya existe para cuando el proveedor de
  IA falla, para revisión humana futura.

Se eligió la **Lectura B** porque "descartar" significa desconfiar de la
categoría propuesta por el modelo, no reemplazarla por otra categoría en la
que tampoco hay certeza — forzar un valor por defecto simularía una confianza
que la regla explícitamente no tiene. Reutilizar la cola de reintento evita
además duplicar el concepto de "mensaje normalizado pendiente de revisión,
no publicado en el feed" que HU-06 ya modela para el caso de fallo del
proveedor. Por eso `ClassificationResult` no se modificó para admitir
`finalCategory: null`: cuando una regla descarta, `ClassifyInstitutionalMessage.execute()`
devuelve `null` (igual que ante un fallo del proveedor) y no se llama a
`resultRepository.save(...)`. Para no perder trazabilidad, `ClassificationRetryEntry`
se extendió con dos campos opcionales — `discardedByRuleId` y
`proposedCategory` — presentes solo cuando la entrada llega por esta vía y no
por un fallo del proveedor. Ver
`tests/classification/ClassifyInstitutionalMessagePostProcessing.test.ts`
(`decision sobre "descartar"...`).

### `ClassificationResultRecord` extendido

Se agregó `appliedRuleId: string | null` junto al `reason` ya existente
(criterio 3). No se duplicó `reason`: se sigue usando para explicar el
_porqué_ (por ejemplo, `"Corregido por regla de posprocesamiento: <id>"`),
mientras que `appliedRuleId` identifica el _qué_ regla, de forma consultable
sin parsear texto. Se registra tanto cuando una regla corrige como cuando una
regla confirma (para trazabilidad completa); queda `null` cuando ninguna
regla activa aplicó al mensaje — comportamiento idéntico al de HU-06 antes de
esta historia.

### Integración con `ClassifyInstitutionalMessage`

El posprocesamiento es una dependencia opcional
(`ruleRepository?: PostProcessingRuleRepositoryPort`) inyectada en
`ClassifyInstitutionalMessage`. Sin ella, el caso de uso se comporta
exactamente igual que en HU-06 (ver
`tests/classification/ClassificationFlow.test.ts`, que sigue pasando sin
cambios). Con ella, después de `classificationPort.classify(message)` y antes
de `resultRepository.save(...)`, se leen las reglas activas y se evalúa la
cadena sobre el mensaje.

### Puerto de repositorio de reglas y adaptadores

`PostProcessingRuleRepositoryPort` (`domain/ports/out/`) sigue el mismo
patrón que el resto del proyecto: `InMemoryPostProcessingRuleRepository` para
pruebas y `MongoPostProcessingRuleRepository` (colección
`post_processing_rules`, índice compuesto `idx_active_precedence` sobre
`{ active, precedence }`) para persistencia real. Expone `findActiveRules`
(usado por la clasificación), `findAll`, `findById`, `save` (upsert — agrega o
edita) y `setActive` (desactiva sin borrar).

### Simulación sobre histórico etiquetado (criterio 6)

`SimulatePostProcessingRule` (`application/SimulatePostProcessingRule.ts`) es
un caso de uso de solo lectura: recibe una regla candidata — no
necesariamente guardada — y un historial, y devuelve qué habría cambiado sin
persistir nada ni tocar ningún repositorio.

**Extensión necesaria sobre la redacción literal del criterio**: el criterio
6 habla de simular sobre "el histórico etiquetado", y el prompt de esta
historia sugiere recibir directamente `ClassificationResultRecord[]`. Pero
`ClassificationResultRecord` no conserva `sender` ni `subject` — esos campos
viven en `InstitutionalMessage` (contexto de ingesta) — y son exactamente lo
que una condición de regla necesita para decidir si aplica. Sin ellos, no hay
forma de simular una regla sobre remitente o asunto contra el histórico. Por
eso el caso de uso recibe `LabeledHistoricalMessage[]`, que empareja cada
`ClassificationResultRecord` con el `InstitutionalMessage` que lo originó —
una extensión del contrato, no un tercer estado ambiguo ni un cambio a
`ClassificationResultRecord`.

La simulación evalúa el efecto de esa única regla candidata en aislamiento,
no de la cadena completa junto a otras reglas ya activas (tal como lo
describe la historia, en singular: "simular su efecto" de una regla). Simular
el impacto de insertarla dentro de la cadena vigente — donde una regla de
mayor precedencia podría interceptar el mensaje antes — queda fuera de este
alcance y se deja como extensión futura explícita.

### Criterios de aceptación y pruebas (HU-09)

| Criterio | Descripción | Prueba correspondiente |
|---|---|---|
| 1 | Reglas sobre el remitente confirman, corrigen o descartan la propuesta | `tests/classification/PostProcessingRuleChain.test.ts` (`criterio 1: ...`) |
| 2 | Expresiones sobre el asunto refuerzan o descartan la clasificación | `tests/classification/PostProcessingRuleChain.test.ts` (`criterio 2: ...`) |
| 3 | Se conservan propuesta, regla aplicada y categoría final al corregir | `tests/classification/ClassifyInstitutionalMessagePostProcessing.test.ts` (`criterio 3: ...`) |
| 4 | Varias reglas en competencia se resuelven por precedencia, de forma determinista | `tests/classification/PostProcessingRuleChain.test.ts` (`criterio 4: ...`, con 3 reglas en distintos órdenes y con empate) |
| 5 | Agregar, editar o desactivar una regla aplica sin redespliegue | `tests/classification/ClassifyInstitutionalMessagePostProcessing.test.ts` (`criterio 5: ...`), `tests/infrastructure/mongo/MongoPostProcessingRuleRepository.integration.test.ts` |
| 6 | Simulación de una regla candidata sobre el histórico, de solo lectura | `tests/classification/SimulatePostProcessingRule.test.ts` |
| — | Decisión sobre "descartar" (no está en un criterio numerado, pero condiciona 1 y 2) | `tests/classification/ClassifyInstitutionalMessagePostProcessing.test.ts` (`decision sobre "descartar"...`) |
| — | Dominio de reglas desacoplado de infraestructura | `npm run check:architecture` |

## HU-10 — confianza, umbral de revisión y métricas del clasificador (RF-15, RNF-25, RNF-26, RNF-28. CU-01 paso 8 y flujo alternativo B)

HU-06 y HU-09 dejaron la evaluación del clasificador "fuera de alcance, se
cierra con la métrica de HU-10". Esta es esa historia.

### Alcance

- Cada clasificación lleva un **puntaje de confianza** (`ConfidenceScore`) que
  se persiste junto al documento (`ClassificationResultRecord.confidenceScore`).
- Un **umbral configurable** (`ReviewThreshold`, leído en cada ejecución desde
  `ReviewThresholdConfigPort`) decide si el documento se **publica** o queda en
  **revisión pendiente** (`ClassificationResultRecord.publicationStatus`).
- La decisión es **política de dominio pura**
  (`domain/services/PublicationDecisionPolicy.ts`, `decidePublicationStatus`):
  recibe `ConfidenceScore` y `ReviewThreshold` y devuelve la decisión, sin I/O.
- Revisión pendiente → alerta al administrador (`AdminAlertPort`) y **exclusión
  del feed**. Publicado → se programan sus notificaciones
  (`NotificationSchedulingPort`).
- Casos de uso puros de **precisión** (`ComputeClassificationPrecision`) y
  **cobertura** (`ComputeCoverageMetric`) sobre una muestra etiquetada
  (`LabeledSampleRepositoryPort`).

No se implementa interfaz de administración, sistema de notificaciones
completo ni corpus de datos reales (ver gaps más abajo).

### Value objects y convenciones

- `ConfidenceScore` y `ReviewThreshold`: número real en **[0, 1]** (como una
  probabilidad), validado en el constructor (`TypeError` fuera de rango, `NaN`
  o infinito), igual que `ClassificationResult` valida sus categorías.
- **Límite exacto** (criterios 2 y 3): puntaje **estrictamente menor** al umbral
  → revisión pendiente; **igual o mayor** → publicado.
- `ReviewThreshold.default()` = **0.6**: punto de partida documentado, **no**
  calibrado. La nota metodológica de la historia es explícita en que no hay
  datos de referencia en la literatura; el valor correcto debe ajustarlo un
  administrador a partir de las métricas reales.
- `ConfidenceScore.certain()` = 1: valor por defecto cuando un
  `ClassificationResult` se construye sin puntaje (código anterior a HU-10).
  Asumir certeza total reproduce exactamente el comportamiento previo, donde
  todo se publicaba.

### De dónde sale el puntaje

`ClassificationPort` ya devuelve un `ClassificationResult`; ese resultado ahora
incluye `confidenceScore`. `InMemoryClassificationAdapter` (el stub de HU-06)
asigna un valor **determinista**, nunca aleatorio: **0.9** cuando un patrón
específico coincidió y **0.4** cuando el mensaje cae en "boletín informativo"
por defecto porque ningún patrón coincidió. Ese es justamente el caso que HU-10
quiere hacer visible en lugar de publicarlo sin avisar. El puntaje real dependerá
del proveedor de IA cuando exista, el mismo límite ya documentado para la
categoría en HU-06.

Las reglas de posprocesamiento de HU-09 cambian la **categoría**, no la
**confianza del modelo**: al confirmar o corregir, `ClassifyInstitutionalMessage`
conserva el `confidenceScore` original. Antes de este cambio, reconstruir el
resultado con `fromCategory` lo reiniciaba de forma silenciosa a 1.

### Gap 1 — dónde vive el estado "publicado / revisión pendiente"

No existía ningún estado de publicación: el feed leía
`ingestion_consolidated_messages` sin ningún filtro de revisión. **Decisión:**
el estado vive en `ClassificationResultRecord.publicationStatus`
(`'published' | 'pending-review'`), no en un repositorio separado. Motivo: el
documento se persiste igual en ambos casos, porque el criterio 7 exige que sea
auditable, y en ese mismo registro ya están el puntaje, la categoría propuesta
y la regla aplicada. Un registro aparte duplicaría esa información.

El **feed excluye explícitamente** lo que está en revisión pendiente, no solo
el cliente: `GetSegmentedFeed` recibe un `classificationResultRepo` opcional y,
por cada convocatoria, consulta
`findByMessageId(representativeMessageId)`. Si el estado es `pending-review`, la
omite (`tests/feed/ReviewPendingExclusion.test.ts`, mismo estilo que
`tests/ingestion/QuarantineExclusion.test.ts`). Una convocatoria **sin registro
de clasificación** se considera visible, con el mismo criterio permisivo que
`GetSegmentedFeed` ya aplica cuando falta el targeting. Ocultar de forma
retroactiva todo lo ingerido antes de HU-10 sería un cambio de comportamiento
fuera de alcance.

Para esto `ClassificationResultRepositoryPort` gana `findByMessageId` y
`findAll`, y `MongoClassificationResultRepository` gana `ensureIndexes`
(índice único `idx_message_id`).

### Gap 2 — alertas al administrador y programación de notificaciones

El contexto `notifications` solo gestiona preferencias y dispositivos: no
tiene ningún caso de uso para "enviar" o "programar" contenido. **No se
construyó ese sistema aquí.** En su lugar hay dos puertos mínimos en
`classification`:

- `AdminAlertPort.notifyPendingReview(record)` (criterio 2).
- `NotificationSchedulingPort.scheduleForPublication(record)` (criterio 3).

Sus adaptadores (`InMemoryAdminAlertPort`, `InMemoryNotificationSchedulingPort`)
son **stubs explícitos** que solo registran la llamada, marcados con `TODO`.
Sirven como doble de prueba y como marcador de producción, igual que
`InMemoryClassificationAdapter` e `InMemoryMailboxAdapter`. No hay plantillas,
contenido ni entrega push; eso pertenece a otra historia.

### Gap 3 — no existe muestra etiquetada del piloto

Los criterios 5 y 6 comparan contra una verdad de referencia etiquetada por
humanos, y **esa muestra no existe en este repositorio**. Quién etiqueta, con
qué proceso y sobre qué periodo de validación es responsabilidad de otro
proceso fuera de este alcance. `LabeledSampleRepositoryPort` (en memoria y
Mongo, colección `classification_labeled_samples`) solo **persiste** pares
`(messageId, actualCategory)` ya etiquetados; no los genera ni los valida.

`ComputeClassificationPrecision` y `ComputeCoverageMetric` son **casos de uso
puros**: reciben los registros y la muestra ya cargados (por ejemplo, con
`ClassificationResultRepositoryPort.findAll()` y
`LabeledSampleRepositoryPort.findAll()`) y devuelven el porcentaje. Se prueban
con fixtures sintéticas.

- **Precisión** (criterio 5): entre los documentos **publicados** con categoría
  final X **que tienen etiqueta humana**, qué proporción es realmente X. Los
  documentos en revisión pendiente no se publicaron, así que no cuentan. Un
  publicado sin etiqueta no puede contar ni a favor ni en contra.
- **Cobertura** (criterio 6): entre los documentos que **realmente** son X según
  la muestra, qué proporción se clasificó como X **y además se publicó**. Uno
  retenido en revisión, mal clasificado o sin clasificar no llegó al
  estudiante.
- Sin datos evaluables, el resultado es `null` y `meetsMinimum: false`: no se
  afirma que el umbral se cumple.

> **Importante: implementar cómo calcular la métrica no confirma que el
> clasificador ya cumpla 80 % / 90 % en producción.** El entregable de esta
> historia es el **mecanismo de cálculo**. Verificar esos umbrales requiere un
> piloto real con una muestra etiquetada que no existe en este entorno. Las
> cifras de las pruebas vienen de fixtures sintéticas y no son resultados
> empíricos.

### Conexión con la ingesta real (corrección técnica posterior a HU-10)

Hasta HU-10, `IngestInstitutionalMessages.consolidate()` clasificaba por su
cuenta con una copia de la lógica de HU-06: no aplicaba las reglas de HU-09 ni
el umbral de HU-10, y `main.ts` no conectaba ningún clasificador. Esa copia se
eliminó. La ingesta ahora recibe una sola dependencia opcional,
`classifyMessage?: ClassifyInstitutionalMessage`, y delega en ella. Detalle
en el README de `ingestion`.

- **Reloj inyectado:** `ClassifyInstitutionalMessage` recibe un `ClockPort`
  **obligatorio** (propio de este contexto, igual que `ingestion`, `consent` y
  `notifications`) para `persistedAt` y `createdAt`, en lugar de `new Date()`.
  Es obligatorio y no opcional porque un reloj por defecto al del sistema
  volvería no deterministas los tiempos justo en el camino que ahora recorre
  la ingesta real. `ClassificationResult.toPersistedRecord` conserva su
  parámetro por defecto `new Date()` para quien lo llame sin fecha, pero el
  caso de uso siempre le pasa la del reloj.
- **Política de reenvíos:** ver la sección siguiente.
- **Cola de reintento idempotente:** `MongoClassificationRetryQueue.save` usa
  upsert por `_id` (conserva el `createdAt` del primer intento y actualiza el
  error), en vez de `insertOne`. Antes, si la ingesta se interrumpía después
  de guardar en la cola y antes de `markAsProcessed`, el mensaje se releía, el
  insert fallaba por clave duplicada en cada ciclo y el lote quedaba detenido
  para siempre. Esto se vuelve realista con una regla de descarte de HU-09,
  que se repite de forma determinista. El doble en memoria tiene la misma
  semántica.
- **`main.ts` conecta la clasificación completa:** clasificador simulado de
  HU-06, repositorios Mongo de resultados, cola de reintento, reglas y umbral,
  y los stubs de alerta y notificaciones, con `ensureIndexes` de resultados y
  reglas. La colección del umbral y la cola de reintento se consultan por
  `_id`, así que no necesitan índice adicional.

### Política de reenvíos (opción B)

HU-03 consolida los reenvíos de una convocatoria en un mismo grupo, pero
`consolidate()` se ejecuta una vez por cada mensaje que llega. Se evaluaron
tres opciones:

- **A — clasificar y notificar solo el primer mensaje del grupo.**
  **Descartada por un bug concreto:** en cada reenvío, el grupo cambia su
  `representativeMessageId` al mensaje nuevo, y el feed (HU-10) busca el
  estado de publicación por ese id. Si el reenvío no se clasifica, no tiene
  registro, el feed lo trata como visible, y una convocatoria en revisión
  pendiente **reaparecería en el feed con el primer recordatorio**.
- **B — clasificar siempre, pero alertar o notificar solo cuando el estado de
  publicación del grupo cambia. Elegida.** Cada representativo tiene su
  registro (el feed sigue siendo correcto) y un reenvío corregido sí se
  refleja en la clasificación.
- **C — clasificar y notificar siempre.** Descartada: produce exactamente los
  avisos duplicados que la deduplicación de HU-03 existe para evitar.

Implementación: la decisión es política de dominio pura,
`decidePublicationNotification(anterior, actual)`
(`domain/services/PublicationNotificationPolicy.ts`). `anterior` es el estado
del `representativeMessageId` previo del grupo, que la ingesta pasa como
`execute(mensaje, previousMessageId)`.

| Estado anterior | Estado actual | Acción |
|---|---|---|
| ninguno | `published` | programar notificaciones |
| ninguno | `pending-review` | alertar al administrador |
| igual al actual | igual | nada |
| `pending-review` | `published` | programar notificaciones |
| `published` | `pending-review` | alertar al administrador |

"Ninguno" incluye un grupo nuevo y un grupo cuyo representativo anterior no
tiene registro (su clasificación falló o una regla la descartó), porque nada
se avisó todavía. Límite conocido: la política mira **solo el estado de
publicación**. Si un reenvío cambia la categoría (por ejemplo, de boletín a
convocatoria con plazo) sin cambiar el estado, el registro y el feed se
actualizan, pero no se vuelve a notificar.

### Riesgo antes de conectar el buzón real

Con los mensajes de prueba de `main.ts`, el boletín de bienestar queda en 0.4 y
por lo tanto en revisión pendiente, como se verificó arrancando `main.ts`
contra MongoDB. Hoy eso no tiene efecto externo: el buzón y los stubs de
alerta y notificaciones son simulados. **Al sustituir el buzón por el cliente
IMAP real** hay que revisar también la clasificación. Con correo real, el
clasificador simulado retendría en revisión todo lo que no reconoce, y la
alerta al administrador es un stub que nadie lee: sería una retención
silenciosa, justo lo que HU-10 quiere evitar. `main.ts` lo advierte en esa
misma línea.

### Corrección: el feed ya no publica lo que se intentó clasificar y no es publicable (bug 1)

Corrección técnica posterior a HU-37 (rama `correccion-bugs-integracion`), no una historia del backlog.

**Problema.** El feed solo ocultaba un mensaje con un registro `pending-review`. Un fallo del proveedor o un descarte por regla (HU-09) escriben en la cola de reintento **sin** registro de resultado, así que el feed los mostraba. Eso contradecía la garantía de HU-06 ("sin marcarlo como publicado ni listo para feed") y la semántica de "descartar". Prueba: `tests/feed/UnpublishableClassificationExclusion.test.ts`. Antes de la corrección, los casos de fallo y de descarte fallaban porque el mensaje aparecía visible.

**Decisión: opción A.** El feed distingue:
- "nunca se intentó clasificar": sin registro y fuera de la cola. Es el histórico de HU-01 a HU-05 y **sigue visible**;
- "se intentó y no es publicable": en la cola, o con registro `pending-review`. **Se oculta**.

`ClassificationRetryQueuePort` gana `contains(messageId)`. El registro de resultado manda sobre la cola: un mensaje que falló y luego se clasificó con éxito vuelve a verse.

**Por qué no la opción B** (guardar siempre un `ClassificationResultRecord`, también al fallar o descartar): el registro exige `proposedCategory`, `finalCategory` y `confidenceScore`, y un fallo del proveedor no tiene ninguno. Habría que volverlos opcionales. Eso afecta a `ComputeClassificationPrecision` y `ComputeCoverageMetric`, que recorren `findAll()` y contarían fallos como clasificaciones, y reabre la decisión de HU-09 de no forzar una categoría ficticia. La opción A no toca el modelo de HU-09/HU-10.

**Consecuencia que hubo que corregir: los reenvíos.** En un reenvío, el mensaje nuevo pasa a ser el representativo del grupo. Con la opción A sola, si el proveedor fallaba al reclasificar el reenvío, una convocatoria **ya publicada desaparecía** por un fallo transitorio. Ahora, ante un fallo del proveedor en un reenvío, `ClassifyInstitutionalMessage` guarda para el mensaje nuevo una copia del resultado del representativo anterior. Conserva el mismo estado, `reason` explica la herencia, y no hay alerta ni notificación porque el estado no cambia. La entrada en la cola se conserva para diagnóstico. Un **descarte por regla no hereda**, porque es una decisión explícita de revisión humana. Si el original tampoco tenía resultado, el reenvío queda oculto.

**Cableado.** `GetSegmentedFeed` exige `classificationResultRepo` y `classificationRetryQueue` **juntos**, y lanza un error si llega solo uno: la mitad del cableado reabriría el bug en silencio.

### Cola de reintento de clasificación: no tiene consumidor (hallazgo del bug 2)

El prompt de la corrección suponía que un mensaje con clasificación fallida "queda reintentándose indefinidamente, ciclo tras ciclo". **En el código no es así.** `ClassificationRetryQueuePort` solo se escribe; ningún código de `src/` lee la cola para reintentar. El mensaje se marca como procesado en la ingesta aunque su clasificación falle, así que no vuelve a clasificarse. El problema real es el opuesto: la cola es un depósito sin salida, y sus mensajes quedan sin clasificar para siempre.

Por eso **no se agregó contador de intentos a esta cola**: con cero reintentos, el umbral nunca se alcanzaría y sería código muerto. Con la corrección del bug 1, esos mensajes quedan **ocultos** del feed en vez de publicados, que es lo que HU-06 y HU-09 prometían ("revisión humana"). El bucle indefinido real estaba en el buzón; ver el README de `ingestion`.

### Gap pendiente: umbral de reintentos de clasificación hacia cuarentena

**Qué se pidió y qué se entregó.** El prompt de la corrección del bug 2 pedía un contador de intentos con umbral configurable hacia cuarentena **tanto para el buzón como para la clasificación**. **Solo se implementó para el buzón** (`INGESTION_MESSAGE_MAX_ATTEMPTS`). **Para la clasificación queda pendiente.**

**Por qué.** Un umbral de reintentos presupone que algo reintenta, y la cola de clasificación no tiene consumidor. Agregar el contador hoy sería código muerto: nunca pasaría de 1.

**Qué hace falta, en este orden (historia aparte):**
1. Un **consumidor de la cola**: un proceso programado que lea `ClassificationRetryQueuePort`, reintente la clasificación con backoff y, si tiene éxito, guarde el `ClassificationResultRecord` (el feed ya lo mostrará, porque el registro manda sobre la cola). El puerto necesitará leer entradas pendientes, no solo `save` y `contains`.
2. Recién entonces, un **contador de intentos por entrada** y un umbral propio (por ejemplo `CLASSIFICATION_RETRY_MAX_ATTEMPTS`), distinto del del buzón porque mide reintentos contra el proveedor de IA y no ciclos de ingesta.
3. Qué hacer al agotar el umbral. La cuarentena de HU-04 (`QuarantineRepositoryPort`) está indexada por `mailboxUid` y guarda MIME crudo, así que probablemente no sea el destino correcto. Un estado "revisión humana definitiva" dentro de `classification` encaja mejor. Hay que decidirlo en esa historia.
4. Las entradas que llegan por **descarte de regla** (`discardedByRuleId`) **no deben reintentarse**: el descarte es una decisión explícita, no un fallo. El consumidor debe filtrarlas.

**Mientras tanto.** Los mensajes con clasificación fallida o descartada quedan en la cola indefinidamente, **ocultos del feed**, y nadie los revisa ni los reintenta. No se pierden (siguen en `classification_retry_queue`), pero tampoco llegan nunca a los estudiantes sin intervención manual.

### Criterios de aceptación y pruebas (HU-10)

| Criterio | Descripción | Prueba correspondiente |
|---|---|---|
| 1 | Puntaje de confianza numérico persistido junto al documento | `tests/classification/ClassifyInstitutionalMessageReviewThreshold.test.ts` (`criterio 1: ...`), `tests/infrastructure/mongo/MongoClassificationResultRepository.integration.test.ts` (`HU-10: persiste puntaje...`) |
| 2 | Bajo el umbral: no se publica, queda en revisión pendiente y se alerta al administrador | `tests/classification/PublicationDecisionPolicy.test.ts` (`criterio 2`), `tests/classification/ClassifyInstitutionalMessageReviewThreshold.test.ts` (`criterio 2: ...`), `tests/feed/ReviewPendingExclusion.test.ts` |
| 3 | Sobre el umbral: se publica y se programan sus notificaciones | `tests/classification/PublicationDecisionPolicy.test.ts` (`criterio 3`, `limite exacto`), `tests/classification/ClassifyInstitutionalMessageReviewThreshold.test.ts` (`criterio 3: ...`) |
| 4 | Ajustar el umbral aplica a las siguientes clasificaciones sin redespliegue | `tests/classification/ClassifyInstitutionalMessageReviewThreshold.test.ts` (`criterio 4: ...`), `tests/infrastructure/mongo/MongoReviewThresholdAndLabeledSample.integration.test.ts` (`criterio 4: ...`) |
| 5 | Precisión ≥ 80 % sobre los publicados como convocatoria con plazo (**mecanismo**, no resultado real) | `tests/classification/ClassificationMetrics.test.ts` (`ComputeClassificationPrecision`) |
| 6 | Cobertura ≥ 90 % de las convocatorias con plazo del buzón (**mecanismo**, no resultado real) | `tests/classification/ClassificationMetrics.test.ts` (`ComputeCoverageMetric`) |
| 7 | Un documento publicado conserva categoría propuesta, puntaje y regla aplicada | `tests/classification/ClassifyInstitutionalMessageReviewThreshold.test.ts` (`criterio 7: ...`, corrección y confirmación) |
| — | `ConfidenceScore`/`ReviewThreshold` validan su rango | `tests/classification/PublicationDecisionPolicy.test.ts` |
| — | Puntaje determinista del stub (decisión 5) | `tests/classification/ClassifyInstitutionalMessageReviewThreshold.test.ts` (`decision 5: ...`) |
| — | Dominio desacoplado de infraestructura | `npm run check:architecture` |
