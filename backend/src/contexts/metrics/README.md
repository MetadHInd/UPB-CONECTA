# UPB Conecta, contexto de métricas de operación

> Documentación específica de este contexto acotado. Para la visión general del proyecto y la arquitectura, ver el [README raíz](../../../README.md).

Implementación de **HU-51 (SCRUM-63): Tablero de métricas de operación y calidad del clasificador** — completa, seis de seis criterios. Trazabilidad: RF-75, RNF-25, RNF-26, RNF-28. Alimentada por HU-04 (cuarentena/bitácora), HU-10 (confianza, umbral de revisión, precisión y cobertura) y HU-11 (correcciones etiquetadas).

Mismo patrón que `consent` (HU-44) y `moderation` (HU-49): **no hay servidor HTTP en este repositorio, y eso no bloquea la historia** — el diseño de la propia historia lo confirma: "el tablero es vista de solo lectura sobre proyecciones del dominio. No introduce lógica de negocio nueva: agrega y presenta hechos ya registrados." Lo que existe hoy no es una UI (no hay ninguna en el backend) sino el caso de uso completo, probado, que un futuro adaptador HTTP invocará — mismo patrón que `src/contexts/identity/README.md` documenta para HU-45/HU-46.

## Alcance

Este contexto **no introduce ningún mecanismo de cálculo propio**. `ComputeClassificationPrecision`, `ComputeCoverageMetric` (ambos HU-10) y `ComputeManualCorrectionRate` (HU-11) ya existen en `classification`, con sus propias pruebas — ver `src/contexts/classification/README.md`. El trabajo de HU-51 es exclusivamente **orquestación**: filtrar los hechos ya persistidos por otros contextos según un periodo seleccionable (criterio 5) y componerlos en un solo objeto de lectura, más una política de alertas (criterio 6) que tampoco calcula nada — solo compara valores ya calculados contra un umbral.

Por esa razón, `metrics` **no tiene infraestructura propia de persistencia**: no crea ningún puerto de repositorio nuevo. Todo el I/O que necesita ya existe:

| Dato | Puerto | Contexto dueño |
|---|---|---|
| Clasificaciones (volumen, precisión, cobertura, base de la tasa de corrección) | `ClassificationResultRepositoryPort.findAll()` | `classification` |
| Mensajes en cuarentena | `QuarantineRepositoryPort.findAll()` | `ingestion` |
| Correcciones manuales | `ClassificationCorrectionRepositoryPort.findAll()` | `classification` |
| Muestra etiquetada | `LabeledSampleRepositoryPort.findAll()` | `classification` |

Mismo patrón exacto que `moderation.GetReviewQueue` (HU-49), que también orquesta puertos de `ingestion` y `classification` sin que el dominio de ninguno de los dos importe al otro — la dependencia cruzada vive solo en la capa de **aplicación** de `metrics`; su dominio (`DashboardPeriod`, `DashboardAlertPolicy`) no importa nada de otro contexto.

Lo único propio de este contexto:

- **`DashboardPeriod`** (dominio, value object): el rango `{from, to}` del criterio 5, con límites inclusivos y validación (`from` no puede ser posterior a `to`), mismo espíritu que `ReviewThreshold`/`ConfidenceScore` (HU-10): un rango inválido falla en la frontera del dominio, no produce un resultado vacío silencioso.
- **`DashboardAlertPolicy`** (dominio, servicio puro): `evaluateMetricAlert(metric, value, threshold, direction)` decide si un valor cruza su umbral. Sin I/O, igual que `authorize(...)` (HU-46) o `ConsentPolicy.evaluate(...)` (HU-44). Ver la sección de diseño más abajo.
- **`GetOperationsDashboard`** (aplicación): el orquestador. Recibe `{from, to, thresholds?}`, filtra cada `findAll()` por fecha dentro del rango, delega el cálculo a los casos de uso de HU-10/HU-11 ya existentes y compone el resultado con las alertas evaluadas.
- **`ClockPort`** propio (dominio) + `SystemClock`/`FixedClock` (infraestructura, en memoria): mismo patrón que cada contexto del proyecto declara su propio reloj — usado únicamente para `generatedAt`, el instante en que se generó el tablero.

## Decisión de diseño: qué significa "cruzar el umbral" (criterio 6)

La historia solo dice "una métrica que cruza su umbral objetivo". Hay dos familias de métricas con semántica opuesta:

- **Piso** (`no-debe-caer-bajo`): precisión y cobertura (RNF-25/RNF-26) son "cuanto más alto, mejor" — el umbral es un **mínimo** aceptable (80 % / 90 %). Cruzarlo es *caer por debajo*.
- **Techo** (`no-debe-superar`): proporción de cuarentena y tasa de corrección manual son "cuanto más bajo, mejor" — el umbral es un **máximo** tolerable. Cruzarlo es *superarlo*.

`evaluateMetricAlert` recibe explícitamente la dirección como parámetro (`MetricAlertDirection`), en vez de asumir una sola semántica para las cuatro métricas — mezclar ambas direcciones en una sola comparación (`value >= threshold` o `value <= threshold` fijo) habría marcado como "alerta" justo las métricas sanas de la familia contraria.

**El límite exacto no es alerta, en ninguna dirección.** Un valor exactamente igual al umbral todavía cumple el objetivo (`0.8` de precisión con mínimo `0.8` cumple; `0.2` de proporción de cuarentena con máximo `0.2` cumple). Esto replica la misma convención que `PublicationDecisionPolicy` (HU-10) ya usa para el umbral de revisión: *"puntaje estrictamente menor al umbral → revisión pendiente; igual o mayor → publicado"*. Mantener la misma regla de límite exacto en las dos historias evita que un administrador tenga que recordar dos convenciones distintas de "cruzar" según qué pantalla esté mirando. Ver `tests/metrics/DashboardAlertPolicy.test.ts` (casos "exactamente en el umbral").

**Sin datos evaluables, no hay alerta — hay un tercer estado explícito (`sin-datos`).** Un periodo sin mensajes ingeridos, o sin muestra etiquetada, no puede "estar bien" ni "estar mal": no hay con qué saberlo. Tratar `null` como alerta habría generado ruido falso (un tablero recién abierto en un periodo vacío se vería en rojo); tratarlo como "normal" habría ocultado silenciosamente la falta de datos, justo el tipo de fallo silencioso que la historia busca evitar ("la literatura advierte que este componente puede fallar de manera silenciosa"). `sin-datos` es un estado de primera clase, no un `normal` disfrazado — mismo principio que `ComputeClassificationPrecision`/`ComputeCoverageMetric` devuelven `precision`/`coverage: null` en vez de forzar `0` cuando no hay documentos evaluables.

**Qué queda fuera de la política de alertas: el volumen ingerido (criterio 1).** El criterio 1 solo pide "consultar el volumen"; a diferencia de los criterios 2-4, ningún criterio ni ningún RNF de esta historia fija un umbral objetivo para el volumen crudo (¿cuántos mensajes "deberían" llegar por periodo depende del calendario académico, no de una cifra fija). Se decidió **no inventar** un umbral para el volumen — hacerlo habría sido una regla de negocio nueva no pedida por la historia, que el propio diseño de HU-51 prohíbe explícitamente ("no introduce lógica de negocio nueva"). El volumen se expone como dato informativo (`OperationsDashboard.volume`), sin entrada en `alerts`.

## Decisión de diseño: umbrales objetivo, de dónde salen

Precisión y cobertura **no traen un umbral nuevo**: reutilizan `minimumPrecision`/`minimumCoverage`, que ya vienen en el resultado de `ComputeClassificationPrecision`/`ComputeCoverageMetric` (0.8 / 0.9, RNF-25/RNF-26). Duplicar esas constantes en `metrics` habría creado dos fuentes de verdad para el mismo número.

Proporción de cuarentena y tasa de corrección manual **no tienen un umbral objetivo documentado en ningún RNF de este repositorio** — a diferencia de precisión/cobertura, ninguna historia previa fijó una cifra para estas dos. Se aplicó el mismo tratamiento que `ReviewThreshold.default()` (HU-10): una constante documentada como **punto de partida, no calibrada con datos reales** (`DEFAULT_MAXIMUM_QUARANTINE_PROPORTION = 0.2`, `DEFAULT_MAXIMUM_MANUAL_CORRECTION_RATE = 0.3`), ajustable por comando (`GetOperationsDashboardCommand.thresholds`) igual que `ComputeClassificationPrecision`/`ComputeCoverageMetric` ya aceptan sobreescribir su mínimo. La nota metodológica de HU-10 aplica igual aquí: el valor correcto es un aporte empírico que un administrador debe calibrar con operación real, no algo que este repositorio pueda inventar sin un piloto.

## Decisión de diseño: la categoría de precisión/cobertura es fija, no seleccionable

El criterio 4 dice literalmente "expone precisión y cobertura **de convocatorias con plazo** frente a sus umbrales objetivo" — no "por categoría configurable". `GetOperationsDashboard` fija `MessageCategory.CONVOCATORIA_CON_PLAZO` internamente al invocar `ComputeClassificationPrecision`/`ComputeCoverageMetric`, en vez de exponer la categoría como parámetro del comando. Generalizar a las 7 categorías del catálogo habría sido una capacidad no pedida por ningún criterio — la propia razón de ser de la historia es detectar la degradación específica sobre convocatorias con plazo ("antes de que un estudiante pierda una convocatoria"), no medir la calidad general del clasificador sobre boletines o eventos.

## Decisión de diseño: `LabeledSample` no tiene fecha propia — cómo se restringe por periodo

El criterio 5 exige que **todas** las métricas se recalculen sobre el rango elegido, incluidas precisión y cobertura. Pero `LabeledSample` (`domain/ports/out/LabeledSampleRepositoryPort.ts`, HU-10) es `{messageId, actualCategory}` — **no persiste ninguna fecha propia**; es, por diseño de HU-10, un corpus de validación sin periodo intrínseco (ver `src/contexts/classification/README.md`, HU-10, gap 3: "quién etiqueta, con qué proceso y sobre qué periodo de validación es responsabilidad de otro proceso fuera de este alcance").

Filtrar solo los `ClassificationResultRecord[]` por `persistedAt` y pasar la muestra etiquetada completa sin tocar habría dejado el numerador de cobertura (`detectedAndPublished`, que sí depende de los registros filtrados) recalculándose por periodo mientras el denominador (`actualInSample`, que `ComputeCoverageMetric` deriva directamente de la muestra etiquetada, sin pasar por los registros) se mantenía constante en el total histórico — con eso, acortar el periodo *deprimiría* artificialmente la cobertura sin que el clasificador hubiera empeorado, exactamente el tipo de lectura engañosa que un tablero de calidad no puede permitirse.

**Decisión adoptada:** `GetOperationsDashboard` restringe la muestra etiquetada a los mensajes que **sí tienen un registro de clasificación dentro del periodo elegido** (`restrictLabeledSampleToPeriod`) — el único dato temporal disponible que conecta una etiqueta con un momento. Un mensaje etiquetado cuyo registro de clasificación cae fuera del periodo no participa en el cálculo de ese periodo (`tests/metrics/GetOperationsDashboard.test.ts`, `una muestra etiquetada cuyo registro de clasificacion cae fuera del periodo...`). Esto hace que precisión y cobertura sí varíen con el periodo elegido, a costa de una aproximación explícita: la fecha real de la etiqueta humana (cuándo un administrador corrigió o etiquetó el mensaje) puede no coincidir con `persistedAt` del registro de clasificación. Corregir eso de raíz exigiría agregar una fecha a `LabeledSample`, un cambio al contrato de HU-10 fuera del alcance mínimo de esta historia — queda documentado como extensión futura, no como algo silenciosamente ignorado.

## Decisión de diseño: qué cuenta como "volumen ingerido" (criterio 1 y 2)

Existe una bitácora de ingesta más directa, `IngestionRunLog`/`IngestionRunLogRepositoryPort` (HU-01/HU-04, contadores `read`/`processed`/`duplicated`/`quarantined` por corrida), pero **su puerto solo expone `save(log)`, sin ningún método de lectura** (`findAll` o equivalente) — no hay forma de consultar corridas pasadas con el código existente. Ampliar ese puerto con una lectura habría sido un cambio a la infraestructura de `ingestion` fuera del alcance mínimo de esta historia, y no es una de las piezas que el diseño de HU-51 señala como reutilizable.

En su lugar, "volumen ingerido" se deriva de los dos destinos posibles de un mensaje ingerido, según el propio diseño de HU-04: o se traduce con éxito y sigue el pipeline hasta clasificarse (`ClassificationResultRepositoryPort`), o queda en cuarentena porque no pudo procesarse (`QuarantineRepositoryPort`). `volume.total = classified + quarantined` — de ahí también que la proporción de cuarentena (criterio 2) sea `quarantined / (classified + quarantined)`, acotada entre 0 y 1 por construcción.

**Límite conocido:** un mensaje que HU-03 deduplica dentro de la ventana temporal (un reenvío que no se vuelve representativo de su grupo) no genera un `ClassificationResultRecord` propio — solo el representativo del grupo se clasifica y persiste. El volumen expuesto aquí es, entonces, "mensajes que llegaron al final del pipeline con un resultado propio" (clasificado o en cuarentena), no "mensajes crudos leídos del buzón" en sentido estricto. Documentado, no oculto — igual que el resto de límites conocidos de `classification`/`ingestion`.

## Estructura

    src/contexts/metrics/
      domain/
        value-objects/DashboardPeriod.ts   Rango {from, to} del criterio 5, con validación e inclusión inclusiva en ambos extremos.
        services/DashboardAlertPolicy.ts   evaluateMetricAlert(...): politica pura de "cruzar el umbral" (criterio 6).
        ports/out/ClockPort.ts             Mismo contrato que el resto de contextos.
      application/
        GetOperationsDashboard.ts          Orquestador: filtra por periodo, delega en los casos de uso de HU-10/HU-11, compone el resultado.
      infrastructure/
        adapters/out/memory/SystemClock.ts SystemClock (real) y FixedClock (pruebas).

No hay adaptadores de MongoDB propios porque no hay persistencia propia que adaptar — este contexto es puramente de lectura y composición sobre repositorios ajenos.

## Autorización (HU-46)

`GetOperationsDashboard` se agregó a `config/protected-operations.json` con `requiredRole: "content-admin"`, aunque `scripts/check-declared-authorization.mjs` **no lo habría exigido automáticamente**: su patrón de nombres (`ADMIN_VERB_PATTERN`) reconoce verbos como `Manage`, `Correct`, `Review`, `Publish`, etc., y `GetOperationsDashboard` empieza por `Get`, fuera de ese patrón (el propio script documenta esa limitación: "un caso de uso administrativo con un nombre que no calce con `ADMIN_VERB_PATTERN` pasaría sin marcarse"). Mismo caso exacto que `GetReviewQueue` (HU-49), que también está en el catálogo sin que el análisis automático lo hubiera forzado.

Se agregó de todas formas porque la historia lo pide explícitamente en su propio enunciado — "yo **como administrador** y como Scrum Master del proyecto, quiero consultar..." — y porque el tablero expone datos operativos sensibles (volumen real de ingesta, tasa de fallos del clasificador) que no tienen sentido como vista pública ni de estudiante. No declararlo habría sido un vacío de seguridad silencioso del mismo tipo que HU-46 existe para prevenir.

## Criterios de aceptación y dónde se verifican

| Criterio | Estado | Prueba |
|---|---|---|
| 1. Consulta el volumen de mensajes ingeridos por periodo | Cubierto | `GetOperationsDashboard.test.ts` (`criterio 1: ...`) |
| 2. Muestra la proporción de mensajes en cuarentena sobre el total ingerido | Cubierto | `GetOperationsDashboard.test.ts` (`criterio 2: ...`) |
| 3. Muestra la tasa de correcciones manuales sobre las clasificaciones publicadas | Cubierto | `GetOperationsDashboard.test.ts` (`criterio 3: ...`) |
| 4. Expone precisión y cobertura de convocatorias con plazo frente a sus umbrales objetivo | Cubierto | `GetOperationsDashboard.test.ts` (`criterio 4: ...`), reutiliza `ComputeClassificationPrecision`/`ComputeCoverageMetric` (HU-10) |
| 5. Un periodo seleccionable recalcula las métricas sobre ese rango | Cubierto | `GetOperationsDashboard.test.ts` (`criterio 5: ...`), `DashboardPeriod.test.ts` |
| 6. Una métrica que cruza su umbral objetivo se resalta como alerta | Cubierto | `DashboardAlertPolicy.test.ts`, `GetOperationsDashboard.test.ts` (`criterio 6: ...`, más "umbral exactamente en el limite...") |
| — | Casos borde: periodo vacío, sin muestra etiquetada, cero mensajes, umbrales personalizados, periodo invertido | `GetOperationsDashboard.test.ts` |
| — | Dominio de métricas desacoplado de infraestructura | `npm run check:architecture` |
| — | Operación administrativa declarada en el catálogo de autorización | `npm run check:authorization`, `config/protected-operations.json` |
