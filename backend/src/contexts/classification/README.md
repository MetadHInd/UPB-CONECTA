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
- Métrica de HU-10: la evaluación del clasificador y la medición de precisión sobre la clase de interés queda fuera de este alcance, según la propia historia.

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
alcance.

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
