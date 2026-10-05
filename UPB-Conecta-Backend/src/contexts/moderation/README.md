# Contexto de moderación (HU-49)

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
| — | Las tres operaciones exigen rol `content-admin` | `npm run check:authorization`, `config/protected-operations.json` |
