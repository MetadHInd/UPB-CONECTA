# Contexto de moderación (HU-49, HU-31, HU-32, HU-52)

> Documentación específica de este contexto acotado. Para la visión general del proyecto y la arquitectura, ver el [README raíz](../../../README.md).

Implementación de **HU-49: Panel de revisión de cuarentena y documentos pendientes de clasificación**. Trazabilidad: **RF-73, RF-06, RF-15, RNF-18. CU-01 flujo alternativo B, excepción E2.**

## Alcance

Un administrador de contenido consulta en una sola cola los mensajes en cuarentena (HU-04, `ingestion`) y los documentos en revisión pendiente (HU-10, `classification`), cada uno con su causa, y decide publicarlos o descartarlos. Sin este panel, un clasificador con precisión moderada (el propio hallazgo de la revisión de literatura del proyecto: ~25% de precisión en la clase de interés) produce documentos atascados en revisión pendiente que nadie revisa — el `AdminAlertPort` de HU-10 es un stub que "nadie lee".

**No se implementa ninguna interfaz de administración (UI) ni servidor HTTP**: mismo patrón que HU-09, HU-30, HU-45 y HU-46. El diseño de la historia en Jira ya lo anticipa: *"el panel es driving adapter sobre los casos de uso"*. Este contexto entrega esos casos de uso, listos para que ese adaptador futuro los invoque.

## Por qué un contexto nuevo, y no una extensión de `ingestion` o `classification`

La cola de revisión es un concepto propio (agrega dos fuentes, dos contextos), y las decisiones de moderación (publicar/descartar con auditoría) no le pertenecen ni a la cuarentena (que es un diagnóstico de ingesta) ni a la clasificación (que es una propuesta de categoría) — es un tercer concepto: *qué hace un humano con lo que el sistema no pudo decidir por sí solo*. Mismo criterio que ya separó `targeting`, `feed`, `forum`, `profile` y `personalization` de sus vecinos.

## Decisión: por qué no se agregó un campo de estado a `QuarantinedMessage` ni a `ClassificationResultRecord`

Descartar un elemento (criterio 4: "deja de aparecer en la cola") podría modelarse añadiendo un campo `resolved`/`discarded` a `QuarantinedMessage` (HU-04) o a `ClassificationResultRecord` (HU-06/09/10). Se descartó esa opción: ninguno de esos dos modelos tiene hoy ningún concepto de "descartado", y no debería tenerlo — esa noción es exclusiva de este panel, no del pipeline de ingesta ni del clasificador. Agregarla ahí acoplaría dos contextos que hoy no se conocen mutuamente en ese sentido.

En su lugar, `ModerationAuditLogPort` cumple **dos roles a la vez** (mismo patrón que `AuthorizationAuditLogPort` de HU-46 y `ClassificationCorrectionRepositoryPort` de HU-11): es el log de auditoría append-only del criterio 7 (usuario, acción, objeto, marca de tiempo) **y**, al mismo tiempo, la fuente de verdad de qué ya se resolvió — `GetReviewQueue` excluye cualquier elemento que ya tenga una decisión registrada. Un solo mecanismo resuelve ambas cosas sin tocar `ingestion` ni `classification`.

## Decisión: "publicar" reutiliza `CorrectClassification` (HU-11), no lo duplica

El criterio 3 pide publicar un documento en revisión pendiente **tal como está**, sin cambiar nada. Se evaluaron dos opciones:

- Opción A: un caso de uso propio, `ResolvePendingClassification`, que solo cambia `publicationStatus` a `'published'`.
- **Opción B (la implementada)**: tratar "publicar sin cambios" como una corrección cuyo valor corregido es idéntico al vigente, y reutilizar `CorrectClassification` (HU-11) pasándole la categoría, el targeting y la fecha de cierre ya existentes.

Se eligió la opción B porque duplicar la lógica de publicación reabriría exactamente los mismos gaps que HU-11 ya documentó (la fecha de cierre no viaja en `NotificationSchedulingPort`, etc.) sin ganar nada, y porque hay una ganancia real: un administrador que aprueba la propuesta del modelo sin tocarla **es** una confirmación humana válida para el corpus de precisión de HU-10 (`LabeledSample`), no un "aprobar" vacío — `CorrectClassification` ya registra ese caso etiquetado automáticamente. `PublishReviewQueueItem` es entonces un adaptador delgado: resuelve los valores vigentes (categoría, targeting, fecha) y se los pasa sin cambios a `CorrectClassification`, y además registra su propia entrada de auditoría (criterio 7).

**Descartar**, en cambio, no tiene equivalente en `CorrectClassification` (que siempre termina en `published`) — es un caso de uso propio (`DiscardReviewQueueItem`) que funciona igual para ambos tipos de elemento (cuarentena o revisión pendiente), a diferencia de publicar, que solo aplica a revisión pendiente (no existe nada válido que publicar de un mensaje que nunca se pudo normalizar).

## Gap: "el crudo original" no existe para un documento en revisión pendiente

El criterio 2 pide ver "el contenido normalizado, el crudo original y la clasificación propuesta" de cualquier elemento de la cola. Para cuarentena (HU-04), el crudo se conserva explícitamente. **Para un mensaje que sí se normalizó con éxito, el MIME crudo no se persiste en ningún lado** — HU-02 lo descarta después de normalizar, porque hasta ahora nada lo necesitaba. `PendingReviewQueueItem.rawSource` es `null` explícito, no un dato que falta por error. Persistir también el crudo de todo mensaje exitosamente normalizado es un cambio de alcance del pipeline de HU-02 (guardar potencialmente el doble de contenido por cada mensaje que llega), fuera de esta historia.

## Puertos nuevos y extensiones a puertos existentes

| Pieza | Contexto | Qué hace |
|---|---|---|
| `QuarantineRepositoryPort.findAll()` | `ingestion` (extensión) | Fuente de los elementos en cuarentena para la cola (criterio 1). |
| `ConsolidatedMessageRegistryPort.findByRepresentativeMessageId(messageId)` | `ingestion` (extensión) | Resuelve el grupo consolidado (cuerpo normalizado, fecha de cierre) a partir del `messageId` que `classification` conoce — sin esto, `classification` no tiene forma de llegar al cuerpo/fecha de un documento en revisión. Usa el índice `idx_representative_message` que ya existía desde HU-12. |
| `ReviewQueueItemRef`, `ReviewQueueItem` | `moderation` (dominio) | Identidad y forma de un elemento de la cola — unión discriminada por `kind`, para que TypeScript impida llamar "publicar" sobre un elemento de cuarentena. |
| `ModerationAuditLogPort` | `moderation` (puerto) | Auditoría append-only + resolución de qué ya se decidió (ver decisión de diseño arriba). |
| `ReviewQueueOrdering.prioritizeReviewQueue` | `moderation` (dominio, política pura) | Orden por fecha de cierre más próxima (criterio 5) y marca de "pendiente crítico" (criterio 6). |
| `GetReviewQueue` | `moderation` (aplicación) | Arma la cola (criterios 1, 2, 5, 6). Solo lectura. |
| `PublishReviewQueueItem` | `moderation` (aplicación) | Criterio 3 — reutiliza `CorrectClassification`. |
| `DiscardReviewQueueItem` | `moderation` (aplicación) | Criterio 4. |

## Configuración

- `REVIEW_QUEUE_CRITICAL_AGE_MS`: cuánto tiempo puede pasar un elemento sin resolverse antes de destacarse como pendiente crítico (criterio 6). Por defecto, 72 horas — un punto de partida documentado, no calibrado contra datos reales de operación, mismo tipo de decisión que `ReviewThreshold.default()` (HU-10).

## Autorización (HU-46)

`GetReviewQueue`, `PublishReviewQueueItem` y `DiscardReviewQueueItem` están declaradas en `config/protected-operations.json` con rol `content-admin`. `scripts/check-declared-authorization.mjs` ganó el verbo `Discard` en su heurístico de nombres (`ADMIN_VERB_PATTERN`) para poder detectar `DiscardReviewQueueItem`; `Publish` ya estaba cubierto desde HU-46.

## Criterios de aceptación y pruebas

| Criterio | Descripción | Prueba correspondiente |
|---|---|---|
| 1 | Cuarentena y revisión pendiente en una sola cola, con la causa de cada uno | `tests/moderation/GetReviewQueue.test.ts` (`criterio 1: ...`) |
| 2 | Contenido normalizado, crudo original y clasificación propuesta con puntaje | `tests/moderation/GetReviewQueue.test.ts` (`criterio 2: ...`, cuarentena y revisión pendiente por separado) |
| 3 | Publicar un documento en revisión entra al feed y programa notificaciones | `tests/moderation/PublishReviewQueueItem.test.ts` |
| 4 | Descartar un documento lo saca de la cola y audita el motivo | `tests/moderation/DiscardReviewQueueItem.test.ts` (`criterio 4`, exige motivo) |
| 5 | La cola se ordena por fecha de cierre más próxima | `tests/moderation/ReviewQueueOrdering.test.ts` (`criterio 5: ...`) |
| 6 | Un elemento sin resolver por más del plazo configurado se destaca como crítico | `tests/moderation/ReviewQueueOrdering.test.ts` (`criterio 6: ...`, límite exacto) |
| 7 | Cualquier decisión queda auditada con usuario, acción, objeto y marca de tiempo | `tests/moderation/PublishReviewQueueItem.test.ts` (`criterio 7: ...`), `tests/moderation/DiscardReviewQueueItem.test.ts` |
| — | Persistencia real (auditoría append-only, `findAll` de cuarentena, `findByRepresentativeMessageId`) | `tests/infrastructure/mongo/MongoModerationSupport.integration.test.ts` |
| — | Dominio desacoplado de infraestructura | `npm run check:architecture` |

---

# Moderación automática previa a la publicación (HU-31)

Trazabilidad: **RF-50, RF-51, RNF-05/11/19/32. CU-03.** Todo texto enviado al foro se analiza antes de hacerse visible y, según el puntaje, se publica, se retiene o se bloquea.

## Diseño

- `ModerationPort` (puerto de salida): recibe solo `{ text }` y devuelve `{ score }` en [0, 1]. El proveedor real de IA no existe en el repositorio: `InMemoryModerationAdapter` es un stub determinístico (no mide toxicidad real), mismo criterio que la clasificación (HU-10).
- `ModerationDecisionPolicy` (dominio puro, fail-safe): `ModerationVerdict` (`publish` / `retain` / `block`) + `ModerationReason`. Puntaje `< lower` publica; `lower..upper` (ambos incluidos) retiene; `> upper` bloquea. Coincidencia con el diccionario bloquea siempre. Sin puntaje (fallo, plazo vencido, respuesta ilegible) o puntaje fuera de [0, 1] retiene. Es el tipo que HU-34 (reportes) puede reutilizar.
- `BannedTermsDictionary`: palabras completas, sin distinguir mayúsculas ni tildes.
- `buildModerationRequest`: arma lo enviado al servicio. El autor nunca viaja como campo, y se enmascaran en el texto correos, números de 6+ dígitos, el identificador estudiantil y las palabras del nombre y usuario del autor. Desde HU-40 el enmascaramiento vive en `hardening/domain/services/PersonalDataMasking.ts` (`maskPersonalData`), compartido con el chatbot.
- `ScreenContent` (aplicación): analiza con plazo (`timeoutMs`, obligatoriamente < 3000 ms) y decide. Nunca lanza por fallos del servicio. Se llama `ScreenContent` y no `Moderate...` porque no es una operación administrativa HTTP (el heurístico de `check:authorization` trata `Moderate*` como tal).
- `RetainedContentQueuePort` + `MongoRetainedContentQueue` (`moderation_retained_content`): cola de revisión humana de lo retenido, con copia completa (nunca llegó a `forum_posts`). Distinta de la cola de HU-49.

## Enganche con el foro

`forum/application/CreatePost` invoca `ScreenContent` después de validar, autorizar y comprobar sanciones (un autor sancionado no gasta una llamada al servicio). Publicado: igual que HU-30. Retenido: se encola y se registra una infracción `retained` (no computa). Bloqueado: se registra una infracción `blocked` con `detectedBy: 'moderacion-automatica'` mediante el `RecordInfraction` de HU-35, que impone la sanción gradual si corresponde. El resultado al autor es `PostRejectionKind.RETAINED_FOR_REVIEW` o `BLOCKED_BY_MODERATION`, con mensajes que no revelan puntaje ni términos.

## Configuración

`config/moderation-policy.json`: `thresholds.lower/upper`, `timeoutMs` (2500) y `bannedTerms`. Los valores por defecto (0.4 / 0.8) son un punto de partida, no calibrados con datos reales. Desde HU-52 este archivo solo aporta los valores **iniciales**: umbrales y diccionario los ajusta el administrador (ver HU-52 más abajo); `timeoutMs` sigue siendo del archivo.

## Criterios y pruebas

| Criterio | Prueba |
|---|---|
| 1 análisis previo | `tests/forum/AutomaticModeration.test.ts` (criterio 1), `tests/moderation/ScreenContent.test.ts` |
| 2 diccionario | `tests/moderation/BannedTermsDictionary.test.ts`, `AutomaticModeration.test.ts` (criterio 2) |
| 3 publica | `AutomaticModeration.test.ts` (criterio 3), `ModerationDecisionPolicy.test.ts` |
| 4 retiene y encola | `AutomaticModeration.test.ts` (criterio 4), `tests/infrastructure/mongo/MongoRetainedContentQueue.integration.test.ts` |
| 5 bloquea e historial | `AutomaticModeration.test.ts` (criterio 5, incluye escalado a sanción de HU-35) |
| 6 fail-safe | `AutomaticModeration.test.ts` (criterio 6), `ScreenContent.test.ts`, `ModerationDecisionPolicy.test.ts` |
| 7 sin datos identificatorios | `tests/moderation/ModerationRequest.test.ts`, `AutomaticModeration.test.ts` (criterio 7) |
| 8 menos de 3 s | `ScreenContent.test.ts`, `AutomaticModeration.test.ts` (criterio 8): con el servicio colgado, el plazo lo corta |

## Diferido

- Proveedor real de IA: solo existe el stub; el criterio 1 se cumple a nivel de puerto. El modelo "adaptado al español" y los 3 s medidos contra un proveedor real quedan pendientes.
- Capa HTTP/cliente móvil: `CreatePost` sigue sin endpoint.
- Revisión humana de lo retenido (aprobar publica; rechazar bloquea y escala la infracción `retained` a `blocked`): la cola se llena, pero ningún caso de uso la consume todavía.
- Comentarios: solo se modera la publicación; el foro aún no tiene comentarios.
- Retroalimentación detallada al autor (HU-32) y reportes (HU-34): fuera de esta historia.
| — | Las tres operaciones exigen rol `content-admin` | `npm run check:authorization`, `config/protected-operations.json` |

## HU-32 (SCRUM-44): retroalimentación al autor sobre la decisión de moderación

Trazabilidad: RF-52, RNF-31, RNF-33. Contenido del foro (HU-30) que la moderación retiene o bloquea; **no** es la cola de convocatorias de HU-49 (mismo contexto, otro modelo: `RetainedContentReview`, no `ReviewQueueItem`). Sin capa HTTP ni cliente: se entregan casos de uso, puertos y adaptadores.

### Diseño: dos representaciones de una misma decisión

| Representación | Tipo | Contenido | Quién la ve |
|---|---|---|---|
| Explicación al autor | `AuthorFeedbackView` (`in-review`, `blocked`, `approved`, `rejected`) | Aviso de revisión con plazo, o motivo y norma de convivencia (`NC-xx`) | El estudiante |
| Registro de auditoría | `ContentModerationLogEntry` (`ContentModerationLogPort`, append-only) | Fragmento, categoría, quién decidió, origen (automático o revisión humana) y `internalDetail` (puntaje, umbral, modelo) | Administradores / sustento de la sanción |

`AuthorFeedbackView` no tiene campos de puntaje, umbral ni modelo: no se filtran por construcción, y la prueba (`HandleModerationDecision.test.ts`, criterio 3) lo verifica sobre la vista y sobre el aviso persistido. Tampoco viaja el fragmento ni quién detectó.

### Decisión de entrada mínima (fusión con HU-31)

`domain/value-objects/ModerationDecisionInput.ts` define `{ contentId, contentKind, authorEmail, verdict: publish | retain | block, category, fragment, detectedBy, internalDetail? }`. HU-31 (decisión automática por umbral) se implementa en paralelo; al fusionar basta mapear su decisión a este tipo o reemplazar ese único archivo. Ninguna otra pieza conoce la forma de la decisión de HU-31.

### Piezas

| Pieza | Capa | Rol |
|---|---|---|
| `ModerationFeedbackConfig` + `config/moderation-feedback.json` | Dominio / dato | Plazo de resolución (24 h) y catálogo de normas por categoría; validado al cargar (`loadModerationFeedbackConfig`) |
| `AuthorFeedbackPolicy` | Dominio (servicio puro) | Construye cada vista y el vencimiento (`retainedAt + plazo`) |
| `RetainedContentReview`, `isReviewOverdue` | Dominio | Elemento de la cola con plazo; vencido solo después del límite exacto |
| `HandleModerationDecision` | Aplicación | Registra, encola si retiene, avisa al autor (criterios 1, 2, 3, 5, 6). Idempotente ante reintentos |
| `ApproveRetainedContent` / `RejectRetainedContent` | Aplicación | Revisión humana: publica o confirma el bloqueo, y avisa (criterio 4) |
| `GetRetainedContentQueue` | Aplicación | Cola pendiente por plazo, con tiempo restante y marca de vencido |
| `EscalateOverdueRetainedContent` | Aplicación | Avisa a administradores, una vez, de lo vencido (criterio 5); lo invoca un planificador futuro |
| Puertos | Dominio | `RetainedContentQueuePort`, `ContentModerationLogPort`, `AuthorFeedbackNotificationPort`, `ModerationAdminAlertPort`, `HeldContentPublisherPort` |
| Adaptadores | Infraestructura | Memoria y Mongo: `moderation_retained_content`, `moderation_content_decisions`, `moderation_notices` |

### Decisiones

- **Se registran solo retener y bloquear** (más la aprobación humana de lo retenido). Publicar directo no motiva nada y no genera registro, aviso ni cola. Una decisión de retener o bloquear sin categoría o sin fragmento se **rechaza** sin registrar ni avisar (criterio 6: sin sustento no hay decisión); una categoría sin norma configurada también (`unknown-category`).
- **La aprobación humana se registra con la categoría y el fragmento de la retención revertida**, y el revisor, para que el historial completo del contenido sea trazable.
- **Bloquear algo retenido** cierra su revisión pendiente como `rejected` (no vuelve a vencerse ni a escalarse).
- **Aprobar publica primero**: si `HeldContentPublisherPort` falla, la revisión sigue pendiente, sin aviso ni registro de una publicación que no ocurrió.
- **Bandeja propia** (`MongoModerationNoticeOutbox`, mismo patrón que `MongoSanctionNoticeOutbox` de HU-35): no se reutiliza la del foro porque sus avisos son del tipo `SanctionNotice` y acoplaría `moderation` a `forum`; el registro de dispositivos y avisos de `notifications` es de convocatorias. Sigue sin haber canal de entrega real.
- **Correo del autor**: se normaliza con el mismo criterio que el foro (`trim` + minúsculas), sin importar `forum`.

### Autorización (HU-46)

`GetRetainedContentQueue`, `ApproveRetainedContent` y `RejectRetainedContent` están en `config/protected-operations.json` con rol `content-admin`. `HandleModerationDecision` y `EscalateOverdueRetainedContent` son internos (los invoca la moderación o un planificador), no operaciones HTTP.

### Diferido

- **Publicar de verdad lo aprobado**: no existe adaptador de `HeldContentPublisherPort` porque el foro aún no retiene contenido antes de publicarlo (llega con HU-31). Hay un adaptador en memoria solo para pruebas.
- **Sanción por bloqueo**: no se invoca `RecordInfraction` (foro, HU-35) desde aquí; quien conecte HU-31 debe llamarlo tras un bloqueo (automático, o `RejectRetainedContent`).
- **Entrega real de avisos** (push/correo) y **planificador** de `EscalateOverdueRetainedContent`: solo la bandeja persistente y el caso de uso.
- **Que la resolución ocurra dentro de 24 h** es una obligación operativa: el sistema garantiza la cola, el plazo, la visibilidad de lo vencido y la alerta a administradores, no que una persona actúe.

### Criterios de aceptación y pruebas

| Criterio | Prueba |
|---|---|
| 1 Retenido: aviso de revisión con plazo máximo | `tests/moderation/HandleModerationDecision.test.ts` (`criterio 1`) |
| 2 Bloqueado: motivo y norma | `HandleModerationDecision.test.ts` (`criterio 2`), `ResolveRetainedContent.test.ts` (rechazo humano) |
| 3 Sin puntaje, umbral ni detalle del modelo | `HandleModerationDecision.test.ts` (`criterio 3`), `ResolveRetainedContent.test.ts`, `MongoModerationFeedback.integration.test.ts` |
| 4 Aprobación humana publica e informa | `ResolveRetainedContent.test.ts` (`ApproveRetainedContent`) |
| 5 Cola y plazo de 24 h | `HandleModerationDecision.test.ts` (`criterio 5`), `ResolveRetainedContent.test.ts` (cola, límite exacto, escalado), `ModerationFeedbackConfig.test.ts` |
| 6 Fragmento y categoría conservados | `HandleModerationDecision.test.ts` (`criterio 6`), `ResolveRetainedContent.test.ts`, `MongoModerationFeedback.integration.test.ts` |

## HU-52 (SCRUM-64): gestión de reglas de moderación y auditoría completa de las decisiones

Trazabilidad: RF-77, RF-78, RNF-18, RNF-32, RNF-33. CU-03 paso 7. Como en HU-31 y HU-32, no hay capa HTTP ni panel: se entregan los casos de uso que el panel de moderación invocará.

### Piezas

| Pieza | Capa | Rol |
|---|---|---|
| `ModerationRules`, `sameBannedTerm` | Dominio | Umbrales y diccionario vigentes; dos expresiones son la misma sin distinguir mayúsculas, tildes ni espacios |
| `ModerationRulesRepositoryPort` + memoria/Mongo (`moderation_rules`) | Puerto / infraestructura | Reglas vigentes, un documento; sin documento rigen las de `config/moderation-policy.json` |
| `ModerationRulesAuditPort` + memoria/Mongo (`moderation_rules_audit`) | Puerto / infraestructura | Auditoría append-only de cada cambio de reglas |
| `ManageModerationRules` | Aplicación | Ajustar umbrales, agregar y retirar expresiones, consultar reglas e historial (criterios 1 a 3) |
| `AutomaticModerationRecord` + `AutomaticModerationRecordPort` + memoria/Mongo (`moderation_automatic_decisions`) | Dominio / infraestructura | Registro de cada decisión automática, con resoluciones humanas anexas (criterios 4 y 5) |
| `ScreenContent` (ampliado) | Aplicación | Lee las reglas en cada evaluación y registra cada decisión |
| `ApproveRetainedContent` / `RejectRetainedContent` (ampliados) | Aplicación | Anexan la resolución humana al registro (criterio 5) |
| `GetModerationDecisionRecord` | Aplicación | Registro completo de un contenido y los fundamentos de la infracción (criterio 6) |
| `ThresholdSimulation` + `SimulateModerationThresholds` | Dominio / aplicación | Efecto de un umbral propuesto sobre el conjunto etiquetado (criterio 7) |
| `ModerationLabeledSampleRepositoryPort` + memoria/Mongo (`moderation_labeled_samples`) | Puerto / infraestructura | Conjunto de prueba etiquetado |
| `scoreWithin` | Aplicación | Consulta al modelo con plazo, compartida por la moderación real y la simulación |

### Decisiones

1. **Reglas leídas en cada evaluación (criterios 1 y 2).** `ScreenContent` pide las reglas a `ModerationRulesRepositoryPort` cada vez, así que un ajuste aplica a la siguiente publicación sin redespliegue. No reevalúa lo ya decidido: cada decisión quedó registrada con las reglas de su momento. El archivo de configuración pasa a ser el valor inicial.
2. **Mismo patrón que los umbrales de sanción de HU-35.** Un documento vigente que se revalida al leerse (un documento editado a mano con umbrales incoherentes falla en vez de moderar mal) y una auditoría aparte, append-only.
3. **Auditoría (criterio 3).** Cada cambio de umbral guarda el valor anterior, el nuevo, el administrador y la hora. Los cambios del diccionario también se auditan: retirar una expresión afloja la moderación tanto como subir un umbral. Un ajuste que no cambia nada no escribe ni audita. Una expresión repetida (sin distinguir mayúsculas ni tildes), vacía o de más de 80 caracteres se rechaza.
4. **Se registra toda decisión automática, también publicar (criterio 4).** HU-32 solo registraba retener y bloquear, porque publicar no motiva un aviso al autor. El criterio 4 pide "cualquier decisión", así que el registro nuevo guarda también las publicaciones, con el texto evaluado (con el marcado neutralizado, HU-47), el puntaje (o `null` si el servicio no respondió), los umbrales y las expresiones del diccionario que coincidieron, el veredicto y el motivo. Si el registro falla, `CreatePost` falla y no se publica nada sin su registro.
5. **Un registro aparte del de HU-32, no una ampliación.** El de HU-32 es una entrada por evento (retención, bloqueo, aprobación), con el fragmento y la categoría que ve el estudiante. El de HU-52 es uno por decisión automática, con el detalle técnico, al que se anexan las resoluciones. Se consultan juntos en `GetModerationDecisionRecord`.
6. **La resolución humana se anexa (criterio 5).** `appendResolution` solo agrega al final de `resolutions` (en Mongo, `$push`, nunca `$set` sobre la parte automática). Aprobar y rechazar lo retenido la anexan con el revisor, la categoría y la hora.
7. **Impugnación (criterio 6).** El administrador llega desde el historial del estudiante (HU-35, `GetModerationHistory`), que nombra cada contenido retenido o bloqueado, a `GetModerationDecisionRecord`: fragmento, categoría, norma de convivencia (`NC-xx`), expresiones del diccionario que coincidieron, quién decidió y cuándo. Si una persona aprobó lo retenido, no hay fundamentos de infracción.
8. **Simulación (criterio 7).** Cada texto etiquetado se puntúa una sola vez con el mismo modelo y plazo que la moderación real y se evalúa contra el diccionario vigente; los umbrales vigentes y los propuestos se aplican a esos mismos puntajes con la misma `ModerationDecisionPolicy`, así que la simulación no puede discrepar de la decisión real. Cobertura = ofensivos no publicados / ofensivos; falsos positivos = no ofensivos no publicados / no ofensivos ("no publicado" incluye lo retenido, que no llega al foro sin una persona). Se devuelve también el detalle por veredicto y la diferencia. No cambia ninguna regla.
9. **El registro no guarda el correo del autor.** Se vincula por `contentId`; el autor está en el registro de HU-32 y en el historial de infracciones de HU-35.

### Autorización (HU-46)

`ManageModerationRules`, `SimulateModerationThresholds` y `GetModerationDecisionRecord` están en `config/protected-operations.json` con rol `content-admin`.

### Colecciones MongoDB

- `moderation_rules`: `_id = 'current'`, `{ lower, upper, bannedTerms, updatedBy, updatedAt }`.
- `moderation_rules_audit`: append-only. Índice `idx_occurred_at` `{ occurredAt: -1 }`.
- `moderation_automatic_decisions`: `_id = kind:contentId:epochMs`. Índice `idx_content_decided` `{ contentId: 1, decidedAt: 1 }`.
- `moderation_labeled_samples`: `_id = sampleId`.

### Limitaciones explícitas

- **El conjunto etiquetado lo construye HU-57** (piloto). Aquí solo existen el repositorio y la simulación; sin muestras, la simulación responde `no-labeled-samples`.
- **Los puntajes de la simulación salen del stub** (`InMemoryModerationAdapter`) mientras no haya proveedor real de IA (HU-31).
- **La categoría de infracción sigue siendo la general (`other`)** en las decisiones automáticas: la política no clasifica el tipo de infracción (HU-31). Una persona puede reclasificarla al rechazar.
- **Una infracción retenida que se aprueba sigue como `retained` en el historial de HU-35** (no computa para sancionar). El registro de HU-52 sí conserva la aprobación.

### Criterios de aceptación y pruebas

| # | Criterio | Pruebas |
|---|---|---|
| 1 | Umbrales ajustables sin redespliegue | `tests/moderation/ModerationRulesAndAudit.test.ts` › criterio 1 (con el foro real); `tests/infrastructure/mongo/MongoModerationRules.integration.test.ts` |
| 2 | Diccionario ajustable sin código | › criterio 2 |
| 3 | Cambio de umbral auditado | › criterio 3; integración Mongo |
| 4 | Cada decisión conserva texto, puntaje, umbral y decisión | › criterio 4 (publicar, retener, bloquear, sin puntaje, registro caído) |
| 5 | Resolución humana anexada sin sobrescribir | › criterio 5; integración Mongo (`$push`) |
| 6 | Fragmento y categoría ante una impugnación | › criterio 6 (desde el historial de HU-35) |
| 7 | Simulación sobre el conjunto etiquetado | › criterio 7; integración Mongo |

Mutaciones comprobadas: ignorar las reglas guardadas hace fallar 4 pruebas; no registrar las publicaciones, 2; registrar un umbral fijo, 1; no auditar, 2; auditar un ajuste sin cambios, 1; comparar expresiones sin normalizar, 1; sobrescribir la decisión al anexar, 2; mantener fundamentos tras una aprobación, 1; contar solo los bloqueos como cobertura, 1.
