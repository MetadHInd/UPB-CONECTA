HU-12 — Feed segmentado por programa/facultad

Decision: Representative message
- Se eligió la Opción A: persistir en el registro consolidado el campo `representativeMessageId` (el `Message-ID` del envío más reciente que actualizó el grupo). Esto permite resolver targeting por mensaje sin cambiar la identidad de las convocatorias.

Alcance y límites
- El contexto `feed` resuelve visibilidad en base a `ProgramTargeting` asociado al `representativeMessageId` de la convocatoria consolidada.
- No se modifica la identidad de las convocatorias (ConvocatoriaId sigue siendo el _id del documento consolidado).
- No se implementó validación end-to-end sobre redes móviles 4G; queda como trabajo pendiente.

Gaps conocidos
- Clasificación/temas no se materializa en la colección de convocatorias: si se desea indexar por `tema` habrá que duplicar los temas en el documento consolidado al momento de consolidar.
- La resolución de targeting se hace consultando `program_targeting` por `messageId` y luego consultando `ingestion_consolidated_messages` por `representativeMessageId`.

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
