HU-12 — Feed segmentado por programa/facultad

Decision: Representative message
- Se eligió la Opción A: persistir en el registro consolidado el campo `representativeMessageId` (el `Message-ID` del envío más reciente que actualizó el grupo). Esto permite resolver targeting por mensaje sin cambiar la identidad de las convocatorias.

Alcance y límites
- El contexto `feed` resuelve visibilidad en base a `ProgramTargeting` asociado al `representativeMessageId` de la convocatoria consolidada.
- No se modifica la identidad de las convocatorias (ConvocatoriaId sigue siendo el _id del documento consolidado).
- No se implementó validación end-to-end sobre redes móviles 4G; queda como trabajo pendiente.

HU-10 — exclusión de documentos en revisión pendiente
- `GetSegmentedFeed` acepta un `classificationResultRepo` opcional. Si se provee, una convocatoria cuyo `representativeMessageId` tiene `publicationStatus: 'pending-review'` se excluye del feed (prueba: `tests/feed/ReviewPendingExclusion.test.ts`). Sin registro de clasificación, la convocatoria se considera visible. Detalle y justificación en el README de `classification`, sección HU-10.

HU-37 — semestre en la segmentación
- `FeedVisibilityPolicy.isVisible(targeting, student, semesters)` exige programa y, si la convocatoria tiene `semesterRange`, que el semestre del estudiante esté en el rango. El feed recibe `StudentSegment { program?, semester? }` en vez de `IdentityProfile`.
- `GetStudentFeed` toma el segmento del perfil persistido (`StudentSegmentPort`), para que un semestre editado aplique en la siguiente carga. Es el punto de entrada que debe usar la capa HTTP. Detalle en `src/contexts/profile/README.md`.

Corrección del bug 1 — lo no publicable no llega al feed
- `GetSegmentedFeed` exige `classificationResultRepo` y `classificationRetryQueue` juntos. Oculta una convocatoria si su mensaje representativo tiene un registro `pending-review` o, sin registro, si está en la cola de reintento de clasificación (fallo del proveedor o descarte por regla de HU-09). Un mensaje que nunca pasó por el clasificador (histórico de HU-01 a HU-05) sigue visible. Un reenvío cuya reclasificación falla hereda el estado del representativo anterior, para que una convocatoria publicada no desaparezca por un fallo transitorio. Detalle y justificación en el README de `classification`; prueba: `tests/feed/UnpublishableClassificationExclusion.test.ts`.

HU-30 — regla de pertenencia compartida
- La comprobación "¿el programa del estudiante entra en el `ProgramTargeting`?" se extrajo a `targeting/domain/services/ProgramTargetingMembership.ts` (`targetingIncludesProgram`), para que el foro restrinja temas con la misma semántica. `FeedVisibilityPolicy` la usa sin cambiar su comportamiento.

Gaps conocidos
- Clasificación/temas no se materializa en la colección de convocatorias: si se desea indexar por `tema` habrá que duplicar los temas en el documento consolidado al momento de consolidar.
- La resolución de targeting se hace consultando `program_targeting` por `messageId` y luego consultando `ingestion_consolidated_messages` por `representativeMessageId`.
- `GetSegmentedFeed.isUnpublishable` sigue llamando `classificationRetryQueue.contains(messageId)` una vez por cada mensaje sin registro de clasificación (no se agregó un método en lote para esto). Es un N+1 acotado por el tamaño de la cola de reintento (solo mensajes que fallaron el clasificador o fueron descartados por una regla), no por el total de documentos consolidados, y hoy no está siquiera cableado en `main.ts` (no existe capa HTTP que use `GetSegmentedFeed`). Si en el futuro la cola de reintento crece al mismo orden que el feed, aplicar aquí el mismo patrón que `findByMessageIds`/`findAll()` de abajo.

## HU-55 (SCRUM-67) — criterio 2: rendimiento del feed y del foro con 20.000 documentos

**Hallazgo (no solo falta de índice, un problema real de N+1).** Antes de esta corrección:

1. `MongoConvocatoriaRepository.findSegmentedFeed` ignoraba el parámetro `profile` por completo (estaba tipado `_profile: any`) y traía **toda** la colección `ingestion_consolidated_messages` sin filtrar — ni siquiera declaraba sus propios índices (`ensureIndexes`), a diferencia de `MongoClassificationResultRepository`, `MongoPostRepository` o `MongoForumAccessAuditLog`. En producción la colección igual queda indexada porque comparte nombre con la que sí gestiona `MongoConsolidatedMessageRegistry.ensureIndexes` (contexto `ingestion`), pero eso era un acoplamiento implícito no garantizado por este archivo.
2. `GetSegmentedFeed.execute` iteraba cada entrada del feed y hacía, **por cada una, dentro del loop**, una consulta async separada a `programTargetingRepo.findByMessageId(repMessageId)` (y, si `classificationResultRepo`/`classificationRetryQueue` estaban configurados, otra más). Con 20.000 documentos esto son decenas de miles de consultas secuenciales a Mongo — el verdadero cuello de botella, no la ausencia de un índice.

**Corrección.**
- `ProgramTargetingRepositoryPort` gana `findByMessageIds(messageIds)` (aditivo, no reemplaza `findByMessageId`, que otros casos de uso puntuales siguen usando: `CorrectClassification`, `PublishConvocatoria`, `PublishReviewQueueItem`, `EmitDueDateReminders`, `NotifyProgramTargetedPublication`). `MongoProgramTargetingRepository` lo resuelve con una sola consulta `$in` sobre `_id` (que ya es el `messageId`, indexado por defecto por Mongo).
- `GetSegmentedFeed.execute` ahora filtra primero lo que no requiere I/O (retirado, sin `representativeMessageId`), junta los `messageId` candidatos, y resuelve targeting **en un solo lote** (`findByMessageIds`) antes del loop. El loop pasó a ser solo lookups en memoria (`Map.get`), sin ninguna consulta async dentro de él.
- La exclusión por clasificación (HU-10, bug 1) usa el mismo principio con lo que ya existía: `ClassificationResultRepositoryPort.findAll()` (ya usado por HU-10 para métricas de precisión/cobertura) reemplaza N llamadas a `findByMessageId` por una sola. `classificationRetryQueue.contains` se conserva puntual — ver "Gaps conocidos" arriba.
- `MongoConvocatoriaRepository` gana `ensureIndexes` propio (`idx_withdrawn_lastsent` sobre `{ withdrawnAt: 1, lastSentAt: -1 }`, idempotente si ya existe un índice equivalente) y ahora filtra `withdrawnAt: null` **en la consulta a Mongo** en vez de traer también lo retirado y descartarlo después en memoria — un campo booleano/fecha sin lógica de negocio, así que empujarlo a la infraestructura no viola la arquitectura hexagonal. La resolución de programa/facultad/semestre (que sí necesita el catálogo institucional) permanece en el dominio (`FeedVisibilityPolicy`), no se empujó a Mongo.
- El foro (`MongoPostRepository.findByTopic`, índice `idx_topic_published` sobre `{ topicId: 1, publishedAt: -1 }`) ya cumplía a esta escala — la prueba lo confirma, no lo asume; no requirió cambios.

**Evidencia medida** (`npx vitest run tests/performance/FeedAndForumThroughput.test.ts`, MongoDB real local, sin mocks):
- `GetSegmentedFeed.execute` sobre 20.050 convocatorias consolidadas: **~174 ms** (presupuesto 2000 ms — no hay un número exacto en la historia para este caso, a diferencia del criterio 1 que sí exige "por debajo de 2 segundos" para 300 sesiones concurrentes; se usa ese mismo umbral como referencia).
- `MongoPostRepository.findByTopic` sobre un tema con 8.000 publicaciones (de 20.000 totales): **~219 ms**.
- Evidencia directa del N+1 corregido, misma colección real: resolver targeting para 500 mensajes con `findByMessageId` uno por uno tomó **~270 ms**; el mismo lote con `findByMessageIds` tomó **~2 ms** (~117x). Extrapolado a los 20.000 documentos del criterio, el patrón anterior (una consulta por documento) habría estado en el orden de varios segundos solo para resolver targeting, muy por encima del presupuesto — de ahí que el hallazgo fuera un problema real de N+1 y no solo "falta de índice".

Prueba: `tests/performance/FeedAndForumThroughput.test.ts`. Distinta de `tests/performance/SegmentedFeedThroughput.test.ts` (HU-12, criterios 5/6): esa prueba más antigua escribe a mano una consulta Mongo con `$in` dentro del propio test, sin pasar por `MongoConvocatoriaRepository` ni `GetSegmentedFeed` — no habría detectado este N+1 porque no ejercita el camino real de producción. La prueba nueva sí instancia las clases reales (`MongoConvocatoriaRepository`, `MongoProgramTargetingRepository`, `GetSegmentedFeed`, `MongoPostRepository`).

Criterios y pruebas
- Criterio 1: Recuperar programa/facultad del perfil y consultar correctamente — tests/unitarios en `tests/feed/GetSegmentedFeed.test.ts` cubren escenarios:
  - estudiante con `program` válido ve convocatorias `all-community`, por `faculty` y por `program`.
  - estudiante sin `program` solo ve `all-community` y se marca `incompleteProfile`.
  - estudiante de otro `program` o `faculty` no ve convocatorias ajenas.
- Criterio 2: Una convocatoria de otro programa nunca aparece — cubierto por tests específicos en `tests/feed/GetSegmentedFeed.test.ts`.
- Criterio 5/6 (rendimiento e índices): se añadió `tests/performance/SegmentedFeedThroughput.test.ts` que genera 20k documentos y verifica que la consulta segmentada (obtener messageIds desde `program_targeting` y luego consultar `ingestion_consolidated_messages` por `representativeMessageId`) cumple un umbral de latencia en la máquina de pruebas.

Índices aplicados
- En `ingestion_consolidated_messages`:
  - `idx_sender_subject` — acelera agrupación/duplicación.
  - `idx_representative_message` — mapea `representativeMessageId` → convocatoria (clave para el feed).
  - `idx_last_sent_at` — ordenamiento por fecha de envío más reciente.
  - `idx_due_date` — consultas por fecha límite.
  - `idx_repmsg_lastsent` — compuesto para consultas por `representativeMessageId` ordenadas por `lastSentAt`.
- En `program_targeting`:
  - `idx_program_ids` — indexa elementos en `programIds` para búsquedas por programa.
  - `idx_faculty_id` — indexa targeting por facultad.

Ejecución de pruebas
- Requisitos: una instancia de MongoDB accesible en `mongodb://localhost:27017`.
- Comandos a ejecutar desde `backend`:

```bash
npm run typecheck
npm run check:architecture
npm test
npm run test:coverage
```

Si prefieres que cree una tarea de backfill para materializar temas en las convocatorias, puedo agregarla como próxima historia.
