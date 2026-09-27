# Contexto de derechos del titular (HU-48)

> Documentación específica de este contexto acotado. Para la visión general del proyecto y la arquitectura, ver el [README raíz](../../../README.md).

**HU-48 (SCRUM-60): ejercicio de derechos del titular y política de retención de la información.** Trazabilidad: RNF-20, RNF-22, RNF-24, Ley 1581 de 2012. Épica EP-10.

## Alcance

El estudiante consulta qué datos conserva el sistema sobre él, rectifica lo rectificable, y solicita la supresión. Además, las convocatorias vencidas se archivan según la política de retención.

Igual que HU-30, HU-35 y HU-24, no hay servidor HTTP ni cliente móvil. Se entregan los casos de uso que esa capa invocará. Quien los invoque debe pasar como `subject` el correo de la sesión verificada (HU-45), nunca un valor del cliente.

| Pieza | Capa | Rol |
|---|---|---|
| `RetentionPolicy` | Dominio | Plazo de supresión, periodo de archivo, canal del directorio, lo que se conserva |
| `ErasureRequest` | Dominio | Solicitud con fecha límite; al completarse descarta el correo |
| `PersonalDataSourcePort` | Puerto | Un área de datos: `collect` y `erase`. Un adaptador por contexto |
| `ProfileRectificationPort`, `RectificationLogPort` | Puertos | Rectificación (delegada a `profile`) y su registro con fecha |
| `ModerationRecordDissociationPort` | Puerto | Disociación del registro de moderación |
| `ConvocatoriaSourcePort`, `ConvocatoriaArchivePort` | Puertos | Origen y registro del archivado |
| `GetPersonalDataReport` | Aplicación | Consulta (criterio 1) |
| `RectifyPersonalData` | Aplicación | Rectificación (criterios 2 y 3) |
| `RequestPersonalDataErasure`, `ErasureExecutor`, `ProcessPendingErasures` | Aplicación | Supresión, reintentos y detección de vencidas (criterios 4, 5 y 7) |
| `ArchiveExpiredConvocatorias` | Aplicación | Archivado (criterio 6) |

## Decisiones

### 1. La supresión coordina por puertos, un adaptador por contexto

`ErasureExecutor` no conoce `profile`, `notifications`, `personalization` ni `forum`: recorre una lista de `PersonalDataSourcePort`. Cada contexto aporta su adaptador en `infrastructure/integration/` (perfil, preferencias, publicaciones, seguimiento, dispositivos). Solo esa carpeta importa otros contextos. Una prueba exige que cada valor de `PERSONAL_DATA_AREAS` tenga una fuente cableada, de modo que agregar un área sin cablearla rompe la compilación de pruebas.

Para permitirlo, los puertos de los contextos afectados ganaron métodos aditivos de consulta y borrado por titular (`findAllByStudent`/`deleteAllByStudent`, `findByAuthor`/`deleteByAuthor`, `delete`). Ningún método existente cambió.

### 2. Plazo: ejecutar de inmediato, con fecha límite de política

La política fija un plazo máximo (`erasure.deadlineDays`), no una espera. `RequestPersonalDataErasure` registra la solicitud con su `dueBy` y la ejecuta enseguida. Si un contexto falla, la solicitud queda `pending`, repetir la petición reutiliza la misma, y `ProcessPendingErasures` (trabajo periódico) la reintenta y reporta como vencida la que supera `dueBy`. La ejecución es idempotente.

### 3. Disociación, no borrado, del registro de moderación (criterio 5)

Infracciones, sanciones, auditoría de sanciones, avisos y accesos denegados se conservan porque la Universidad debe poder sustentar las sanciones. Solo cambia el correo del titular por un seudonimo aleatorio (`titular-suprimido-<uuid>`) que **no se deriva del correo y no se guarda en ninguna tabla de correspondencia**. La solicitud completada también descarta el correo. La disociación ocurre al final, tras borrar todo lo demás.

Límite conocido: el texto de un contenido bloqueado se conserva (sustenta la sanción) y, si el propio autor escribió allí un dato identificador, sigue ahí. Redactarlo requeriría un criterio de moderación que esta historia no define.

### 4. Lo que se conserva sin ser suprimible

El consentimiento (HU-44) se conserva como prueba de la autorización (Ley 1581). Se declara en `retainedRecords` de la política, y la consulta y la confirmación de supresión lo informan al titular.

### 5. Directorio: el canal sale de la política

`RectifyPersonalData` delega en `UpdateStudentProfile` (HU-37) la frontera solo lectura / editable: sigue habiendo una sola fuente. Si la petición toca un campo del directorio se rechaza completa con el canal de `directoryCorrectionChannel`. **El nombre del canal en `config/data-retention-policy.json` es un valor provisional que la Universidad debe confirmar.**

### 6. Archivado (criterio 6)

`ArchiveExpiredConvocatorias` archiva las convocatorias con fecha de cierre cuando pasan `convocatoriaArchive.afterDueDateDays` días. Registra el archivado en su propia colección (`datarights_convocatoria_archive`) y no modifica `ingestion`. Las convocatorias sin fecha concreta no vencen.

## Pendiente (fuera del alcance de este backend)

- **Capa HTTP y cliente móvil:** la pantalla de "Mis datos" y los endpoints. Los casos de uso están listos.
- **Planificadores:** `ProcessPendingErasures` y `ArchiveExpiredConvocatorias` son trabajos periódicos; falta programarlos en `main.ts`. Hoy `main.ts` tampoco cablea `forum`, `profile` completo ni `personalization`.
- **Consumo del archivo:** el feed y el detalle todavía no consultan `ConvocatoriaArchivePort`; el archivado queda registrado pero no oculta nada por sí solo.
- **Sesiones:** la supresión no revoca los tokens de refresco vigentes del titular (`identity`). Si vuelve a iniciar sesión, el perfil se vuelve a sincronizar desde el directorio, lo cual es esperado.
- **Notificación de confirmación:** la confirmación se devuelve como resultado del caso de uso. No se envía push ni correo (el dispositivo se elimina en la propia supresión).
- **Registro de accesos denegados en memoria:** la disociación en memoria cubre infracciones, sanciones y auditoría de sanciones; el adaptador Mongo cubre además avisos y accesos denegados.
