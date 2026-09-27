# Contexto de reportes de la comunidad (HU-34)

Trazabilidad: RF-53, RF-54, RNF-18, RNF-11 (fail-safe). Épica EP-07.

## Alcance

El estudiante reporta una publicación indicando la causa; el reporte se encola para el administrador y, al acumular reportes distintos hasta el umbral configurable, el contenido se oculta preventivamente hasta que un administrador lo revise.

| Pieza | Capa | Rol |
|---|---|---|
| `ContentReportCase` | Dominio | Contador de reportes por contenido y transición `open -> hidden-preventively -> infraction-confirmed` |
| `ReportPolicy` + `config/community-reports.json` | Dominio / datos | Umbral de ocultamiento, causas admitidas y umbral de abuso |
| `ReportedContentPort`, `InfractionRecorderPort`, repositorios y auditoría | Puertos | |
| `ReportContent` | Aplicación | Criterios 1 a 4 |
| `ReviewReportedContent` | Aplicación | Criterios 5 y 6: restaurar o confirmar, auditado |
| `GetReportQueue`, `GetReportAbuseFlags` | Aplicación | Vistas del administrador |
| `GetAuthorContentStatus` | Aplicación | Lo único que ve el autor (criterio 2) |
| Adaptadores en memoria y Mongo | Infraestructura | `report_cases`, `report_outcomes`, `report_abuse_flags`, `report_audit` |
| `ForumReportedContentAdapter`, `ForumInfractionRecorderAdapter` | Integración | Ocultar/mostrar la publicación del foro y escribir en el historial de infracciones de HU-35 |

## Decisiones

- **Umbral.** Se oculta al **alcanzar** `hideThreshold` reportantes distintos (por defecto 3). Un usuario cuenta una vez, tanto por la lógica de dominio como por el `addReport` atómico del repositorio (también ante peticiones simultáneas).
- **El contenido pertenece al foro.** El ocultamiento es `Post.hiddenAt`: `ListTopicPosts` no lista lo oculto. El contexto `reports` solo lo cambia por `ReportedContentPort`.
- **Fail-safe (RNF-11).** El caso se persiste como oculto antes de ocultar el contenido; un reporte posterior sobre un caso oculto vuelve a ocultar el contenido. Al restaurar, el caso se actualiza antes de volver a mostrar. Un fallo intermedio siempre deja el contenido oculto, no visible.
- **Restaurar** reinicia el contador (se conserva la ronda en `history`); hacen falta reportes nuevos para ocultar otra vez. **Confirmar** es final: el contenido sigue oculto y se registra un `BLOCKED` con `detectedBy: 'community-reports'` en el historial de HU-35 (`RecordInfraction`), que decide la sanción gradual.
- **Reportantes.** Solo los ven los administradores (`GetReportQueue`). El autor solo obtiene `visible | hidden-under-review | removed`.
- **Abuso (criterio 6).** Al restaurar, cada reportante de la ronda suma un reporte infundado; con `abuse.unfoundedReportsThreshold` infundados dentro de `abuse.windowDays` se crea (o actualiza) una marca abierta y se audita. Es un registro para que el administrador evalúe: la historia no define una sanción automática al reportante.

## Fuera de alcance / diferido

- **Comentarios.** El foro no tiene comentarios todavía; el caso de uso acepta `kind: 'comment'` pero el adaptador del foro responde "no encontrado". Al existir comentarios solo hay que extender `ForumReportedContentAdapter`.
- **Capa HTTP y roles.** Las operaciones administrativas están declaradas en `config/protected-operations.json`; `performedBy` y `reporterEmail` los provee la sesión verificada (HU-45/46).
- **Resolver la marca de abuso** (descartarla o actuar sobre la cuenta) y **notificar al autor** del ocultamiento.
- **Concurrencia de `update`**: `update` reemplaza el caso completo; un reporte que llegue justo entre la lectura y el reemplazo de la transición podría perderse. Es tolerable porque el caso ya está oculto y en revisión.
