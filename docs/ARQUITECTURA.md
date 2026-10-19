# Arquitectura de UPB Conecta

Documento de arquitectura (RNF-46). Describe los puertos, los adaptadores y el modelo de datos documental tal como están en el código de este repositorio. Se verifica en cada build con `npm run check:architecture` (RNF-41).

## 1. Estilo: arquitectura hexagonal

El `backend/` (Node.js 22 + TypeScript) se divide en **contextos acotados** (`backend/src/contexts/<contexto>/`). Cada contexto tiene tres capas y una sola dirección de dependencia:

```
infrastructure  ──►  application  ──►  domain
(adaptadores)        (casos de uso)    (entidades, objetos de valor,
                                        servicios de dominio y puertos)
```

- **domain**: no importa frameworks, persistencia ni clientes externos. Declara los **puertos** (interfaces) en `domain/ports/out` (lo que el dominio necesita del exterior) y `domain/ports/in` (lo que ofrece).
- **application**: casos de uso (`execute(...)`) que orquestan el dominio a través de los puertos.
- **infrastructure**: **adaptadores** que implementan los puertos (`adapters/out/{mongo,memory,imap,jwt,redis,...}`) y la entrada HTTP (`infrastructure/http`).

`scripts/check-architecture.mjs` falla el build si una capa importa de otra que no le corresponde. La composición de dependencias ocurre solo en las raíces de composición: `src/main.ts` (planificadores) y `src/http-server.ts` (API).

## 2. Procesos y despliegue

| Proceso | Entrada | Función |
|---|---|---|
| API | `src/http-server.ts` (`SERVICE_ROLE=api`, 2 o más réplicas) | Express: `/auth/*`, `/messaging/*` y los endpoints de cada contexto; `/health` y `/ready` |
| Worker | `src/main.ts` (`SERVICE_ROLE=worker`, 1 réplica) | Planificador de ingesta y de avisos; un arrendamiento en MongoDB (`scheduler_leases`) impide dos ejecuciones simultáneas |

Estado compartido entre réplicas: MongoDB (fuente de verdad). Redis es opcional (`REDIS_URL`): cachea sesiones revocadas y el límite de login; si no está o cae, todo sigue sobre MongoDB.

## 3. Contextos, puertos y adaptadores

La columna "Adaptador real" es el que se usa en producción. Los adaptadores `memory` existen para pruebas. Los marcados **stub** o **doble** son sustitutos hasta que haya un proveedor real (RNF-42: cambiarlos no toca el dominio ni los casos de uso).

| Contexto | Responsabilidad | Puertos de salida principales | Adaptador real |
|---|---|---|---|
| `ingestion` | Ingesta del buzón, normalización, cuarentena, bitácora, consolidación | `MailboxIngestionPort`, `MessageNormalizerPort`, `ProcessedMessageRegistryPort`, `QuarantineRepositoryPort`, `IngestionCursorRepositoryPort`, `IngestionRunLogRepositoryPort`, `DueDateExtractorPort` | Mongo; `ImapMailboxAdapter` (conexión real pendiente, T-01) con `RetryingMailboxAdapter` y `CircuitBreakerMailboxAdapter`; `MimeMessageNormalizerAdapter` |
| `classification` | Categoría, puntaje, reglas por remitente y asunto, revisión, corrección | `ClassificationPort`, `ClassificationResultRepositoryPort`, `PostProcessingRuleRepositoryPort`, `ReviewThresholdConfigPort`, `ClassificationRetryQueuePort`, `LabeledSampleRepositoryPort` | Mongo; clasificador **stub** (`InMemoryClassificationAdapter`) |
| `targeting` | Programas destinatarios de cada mensaje | `ProgramCatalogPort`, `ProgramTargetingRepositoryPort` | Mongo; catálogo en `config/program-catalog.json` |
| `feed` | Feed segmentado por perfil | `ConvocatoriaRepositoryPort`, `StudentSegmentPort` | Mongo |
| `personalization` | Leída, guardada, archivada por usuario | `PersonalStateRepositoryPort` | Mongo |
| `notifications` | Dispositivos, avisos de vencimiento, preferencias, agrupación y límite diario | `DeviceRegistryPort`, `NotificationPreferencesRepositoryPort`, `EmittedReminderRegistryPort`, `DueDateConvocatoriaSourcePort`, `StudentDirectoryPort` | Mongo; envío push **pendiente** (no existe `PushProviderPort`) |
| `practices` | Oferta consolidada, carga manual, seguimiento de postulación | `PracticeOfferRepositoryPort`, `PracticeApplicationTrackingRepositoryPort`, `PracticeConvocatoriaSourcePort` | Mongo |
| `campus` | Catálogo de espacios, niveles, puntos de interés | `CampusCatalogRepositoryPort`, `MapProviderPort` | Catálogo en `config/campus-catalog.json` de solo lectura; proveedor de mapas **doble** |
| `forum` | Temas, publicaciones, autor verificado, infracciones y sanciones | `PostRepositoryPort`, `TopicRepositoryPort`, `ForumAuthorRepositoryPort`, `InfractionRepositoryPort`, `SanctionRepositoryPort`, `SanctionThresholdsRepositoryPort` | Mongo |
| `moderation` | Decisión por umbral, retención, reglas ajustables, auditoría | `ModerationPort`, `ModerationRulesRepositoryPort`, `RetainedContentQueuePort`, `ModerationAuditLogPort`, `ContentModerationLogPort` | Mongo; modelo de moderación **stub** (categoría automática fija en `other`) |
| `reports` | Reporte comunitario y ocultamiento preventivo | `ReportCaseRepositoryPort`, `ReportAbuseFlagRepositoryPort`, `ReportedContentPort`, `InfractionRecorderPort` | Mongo |
| `chatbot` | Respuesta anclada a fuente, escalamiento, contexto de sesión | `ChatbotPort`, `KnowledgeBasePort`, `ConversationContextStorePort`, `EscalationLogPort` | `RepositoryKnowledgeBase`; proveedor del chatbot **stub**; contexto de conversación solo en memoria |
| `knowledge` | Base de conocimiento administrable con historial | `KnowledgeEntryRepositoryPort`, `KnowledgeAuditLogPort` | Mongo |
| `profile` | Perfil sincronizado con el directorio, semestre | `StudentProfileRepositoryPort`, `ProgramCatalogPort` | Mongo |
| `identity` | Login, sesión firmada, roles, límite de intentos, auditoría | `IdentityProviderPort`, `TokenSigningPort`, `RefreshTokenRepositoryPort`, `AccountRoleRepositoryPort`, `RateLimiterPort`, `SecurityAuditLogPort`, `ProtectedOperationsCatalogPort` | `MongoIdentityProviderAdapter` (cuentas scrypt; el directorio institucional real es `RealIdentityProviderAdapter`, aún un stub); `JoseTokenSigningAdapter`; Mongo y Redis |
| `consent` | Política de datos y normas del foro con versión | `ConsentRepositoryPort`, `PublishedConsentVersionsPort`, `ConsentRequiredOperationsCatalogPort` | Mongo |
| `hardening` | Validación y límite de tasa en puntos de entrada | `RateLimiterPort`, `RateLimitAuditLogPort` | Ventana deslizante y Mongo |
| `datarights` | Consulta, rectificación y supresión; archivo de vencidas | `ErasureRequestRepositoryPort`, `PersonalDataSourcePort`, `ProfileRectificationPort`, `ModerationRecordDissociationPort`, `ConvocatoriaArchivePorts` | Mongo |
| `metrics` | Volumen, cuarentena y correcciones (tablero) | `ClockPort` | Servicios de dominio sobre los demás contextos |
| `messaging` | Mensajería profesor y estudiante | `ConversationRepositoryPort`, `MessagingDirectoryPort`, `MessagingIdGeneratorPort` | Mongo; directorio por `IdentityMessagingDirectoryAdapter` |

Los contextos se comunican por adaptadores de integración que viven en la infraestructura de quien consume (por ejemplo `IdentityProfileSyncAdapter`, `IdentityForumAuthorSyncAdapter`, `NotificationsDeviceInvalidationAdapter`), nunca importando el dominio de otro contexto.

## 4. Configuración como datos

`backend/config/` guarda las reglas que cambian sin recompilar: `program-catalog.json`, `protected-operations.json`, `rate-limit-policies.json`, `consent-required-operations.json`, `consent-document-versions.json`, `moderation-policy.json`, `moderation-feedback.json`, `community-reports.json`, `campus-catalog.json`, `knowledge-base.json`, `chatbot-official-channel.json`, `chatbot-out-of-scope.json`, `practice-listing-policy.json` y `data-retention-policy.json`. Las operaciones protegidas deben declararse en `protected-operations.json` y `npm run check:authorization` lo verifica.

## 5. Modelo de datos documental (MongoDB)

58 colecciones, una familia por contexto. Los diagramas ER están en `Diagramas/er-01` a `er-08` (ingesta y clasificación, identidad, foro, moderación y reportes, notificaciones y seguimiento, campus, caché del móvil, mensajería). Ejemplos de colecciones: `identity_users`, `identity_login_failures`, `identity_account_roles`, `messaging_conversations`, `scheduler_leases`. Los índices los crea cada repositorio con `ensureIndexes`, y una prueba exige crearlos para todo repositorio que se componga.

## 6. Cliente móvil

`Frontend/` (Android, Kotlin, Jetpack Compose) separa `domain/`, `data/` y `ui/`. `data/repository/Repositories.kt` define una interfaz por recurso y su implementación `Fake*`; la caché sin conexión usa Room (HU-17). Para consumir la API se agrega una implementación HTTP de la misma interfaz, sin tocar la interfaz de usuario. Ver `Frontend/ARQUITECTURA-INTEGRACION.md`.

## 7. Calidad verificable

| Verificación | Comando | Qué garantiza |
|---|---|---|
| Tipos | `npm run typecheck` | Compilación estricta |
| Capas | `npm run check:architecture` | RNF-41 (dominio aislado) |
| Autorización | `npm run check:authorization` | RNF-14 (toda operación protegida declarada) |
| Pruebas y cobertura | `npm run test:coverage` | RNF-43 (umbral 80 %) y RNF-44 (dobles de falla) |
| Dependencias | `npm audit` | Sin vulnerabilidades conocidas |
