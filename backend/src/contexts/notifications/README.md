# UPB Conecta, contexto de notificaciones

> Documentación específica de este contexto acotado. Para la visión general del proyecto y la arquitectura, ver el [README raíz](../../../README.md).

Implementación de **HU-18 (SCRUM-30): Registro y ciclo de vida del dispositivo para entrega de notificaciones** — **parcial**: criterios 1-5 —, **HU-38 (SCRUM-50): Preferencias de notificación por categoría, anticipación de avisos y tema visual** — **parcial**: criterios 1, 2, 3, 5 y 6 —, **HU-21 (SCRUM-33): Agrupación de avisos, límite diario y apertura directa al detalle** — **parcial**: criterios 1, 2, 3 y 6 —, **HU-19 (SCRUM-31): Aviso anticipado al vencimiento según la preferencia del estudiante** — **completa**: criterios 1-6 — y **HU-20 (SCRUM-32): Aviso de nueva convocatoria pertinente al programa del estudiante** — **completa**: criterios 1-5. Trazabilidad: RF-26, RF-64, RF-61, RF-62, RF-63, RNF-38, RF-29, RF-30, RF-27, RNF-03, RF-28, RF-74.

Segundo contexto del backend fuera de `ingestion` (junto a `consent`), mismo patrón hexagonal. HU-18, HU-38 y HU-21 llevaban documentando su pieza como dependencia de "un futuro planificador de avisos (HU-20, no implementada)": HU-18 le dice a *quién* enviar, HU-38 le dice *si* debe enviar y *con cuánta anticipación*, HU-21 decide *cómo agrupar y limitar* lo que ya se decidió enviar. HU-19 y HU-20 son ese planificador: HU-19 decide *cuándo* avisar por vencimiento, HU-20 decide *cuándo* avisar por publicación. Ambas producen `PendingNotification` (HU-21), consultan `NotificationPreferencesPolicy` (HU-38) y, en producción, sus destinatarios finales se abanican a los dispositivos que expone HU-18 — aunque, como en el resto de este contexto, "emitir" sigue significando "producir el `PendingNotification`", no enviar un push real (ver el gap de `PushProviderPort` en la sección de HU-18 más abajo, que sigue sin construirse: no cambia con esta historia).

## Alcance: qué cubre cada historia y qué queda diferido

### HU-18 — Registro de dispositivos

Es sobre el **registro**, no sobre el envío de avisos: eso es responsabilidad del emisor real (push), que seguirá sin existir hasta que se construya un `PushProviderPort` (mencionado en el propio diseño de la historia en Jira). HU-19/HU-20 (ver más abajo) ya producen el `PendingNotification` que ese futuro emisor consumiría junto con `ListActiveDevices`, pero ninguna de las dos historias construye el `PushProviderPort` en sí — sigue sin haber nada que enviar de verdad, solo que ahora sí hay algo que *decidir* enviar.

- **`DeviceRegistration`** (dominio): entidad con estado `active`/`invalidated`. Invalidar conserva el registro (con la razón: `logout` o `delivery-failed`) en vez de borrarlo, consistente con el resto del proyecto (HU-04 hace lo mismo con la cuarentena) — permite diagnosticar por qué un dispositivo dejó de recibir avisos.
- **`RegisterDevice`** (aplicación): registra un token nuevo, o si el proveedor lo rotó (`previousToken`), actualiza el registro existente en el mismo lugar en vez de duplicarlo (criterios 1 y 2).
- **`InvalidateDevice`** (aplicación): cierre de sesión y fallo de entrega reportado por el proveedor llegan al mismo lugar del dominio — en ambos casos el dispositivo deja de ser un destino vigente (criterios 3 y 5).
- **`ListActiveDevices`** (aplicación): todos los dispositivos vigentes de un estudiante, para el abanico de un aviso (criterio 4).
- **`DeviceRegistryPort`** + adaptadores en memoria y MongoDB: `register`/`rotateToken` hacen upsert por `deviceToken` (`_id` en Mongo), que es lo que garantiza "sin duplicar entradas" sin una consulta previa.

**Diferido:** criterio 6 ("el estudiante deniega el permiso de notificaciones, las funciones restantes operan sin degradación y se le explica qué pierde") es comportamiento del cliente móvil — no hay una pieza de dominio backend que lo represente; el backend ya no depende de que exista un dispositivo registrado para nada más, así que la garantía de "sin degradación" ya se cumple por diseño, pero la explicación al usuario es responsabilidad de la app.

### HU-38 — Preferencias de notificación

`NotificationPreferences` es "entidad de dominio consultada por el planificador de avisos, no una configuración local del cliente" (diseño de la historia en Jira): vive en el servidor porque el futuro planificador necesita consultarla antes de emitir cada aviso, no solo el cliente móvil.

- **`NotificationPreferences`** (dominio): categorías activas/inactivas (opt-out: una categoría nunca tocada está activa por defecto), anticipación de aviso, tema visual. `ALLOWED_LEAD_TIMES_MINUTES` fija el catálogo de anticipaciones admitidas (1h, 3h, 1 día, 3 días) — el ticket no los enumera, quedó como decisión de diseño ajustable sin tocar el resto del dominio.
- **`NotificationPreferencesPolicy`** (dominio): `isCategoryEnabled` (criterios 1, 2) y `assertValidLeadTime` (criterio 5, rechaza antes de persistir nada).
- **`UpdateNotificationPreferences`** / **`GetNotificationPreferences`** (aplicación): aplican solo los cambios recibidos sobre lo vigente (o los valores por defecto en el primer guardado); el tema y el resto de preferencias sobreviven entre sesiones porque el servidor es la fuente de verdad (criterio 6).
- **`NotificationPreferencesRepositoryPort`** + adaptadores en memoria y MongoDB: upsert por `studentId` — a diferencia de `consent` (append-only), aquí solo importa el estado vigente.

**Resuelto por HU-19:** el criterio 4 (recalcular los avisos ya programados al cambiar la anticipación) ya no está diferido. `EmitDueDateReminders` (HU-19) no agenda avisos por adelantado: relee `GetNotificationPreferences` en cada ciclo del poller, así que un cambio de anticipación aplica al ciclo siguiente sin ninguna invalidación explícita — ver la sección [HU-19](#hu-19--aviso-anticipado-al-vencimiento-según-la-preferencia-del-estudiante-rf-27-rnf-03-rf-62).

**Diferido:**
- **Criterio 7** (contraste AA y escalado de fuente del sistema operativo): es enteramente de interfaz/accesibilidad del cliente móvil, sin contraparte de dominio backend.

### HU-21 — Agrupación de avisos y límite diario

`NotificationBatchingPolicy` opera sobre `PendingNotification`, un aviso ya filtrado por HU-38 y con destinos resueltos por HU-18 — HU-21 no decide *si* se envía ni *a quién*, solo *cuándo se agrupan* y *cuántos caben por día*. No tiene capa de aplicación propia: es una política de dominio pura, sin estado que persistir, pensada para que el planificador de avisos (HU-19/HU-20, ver más abajo) la invoque directamente sobre lo que produce — mismo patrón que `QuarantineIncidentPolicy` (HU-04), que tampoco necesitó envolverse en un caso de uso. `EmitDueDateReminders` y `NotifyProgramTargetedPublication` (HU-19/HU-20) ya producen exactamente `PendingNotification[]`; conectar esa salida a `NotificationBatchingPolicy.groupByWindow`/`applyDailyLimit` antes del futuro emisor real es una composición de una línea, todavía no cableada en `main.ts` porque no hay ningún emisor real (push) que consuma el resultado agrupado — ver el gap de `PushProviderPort` en HU-18.

- **`groupByWindow`** (criterio 1): agrupa por estudiante los avisos cuya fecha de generación cae en la misma ventana de tamaño fijo. Ventanas fijas (no deslizantes) son deterministas y fáciles de probar en los bordes, a cambio de no agrupar el caso raro de dos avisos separados por menos de la ventana pero a caballo entre dos ventanas — la misma compensación ya aceptada en HU-03.
- **`applyDailyLimit`** (criterios 2 y 6): reparte los lotes entre "se envían ahora" y "se difieren" respetando el límite diario por estudiante, ordenando siempre por urgencia descendente. Un lote diferido no se pierde: vuelve a pasar por `applyDailyLimit` en la ventana siguiente junto a los avisos nuevos, y como la urgencia se conserva, compite de nuevo por el cupo sin perder prioridad frente a avisos más recientes pero menos urgentes.
- **`readNotificationBatchingConfig`**: ventana de agrupación (`NOTIFICATION_BATCH_WINDOW_MS`) y límite diario (`NOTIFICATION_DAILY_LIMIT`) configurables por variable de entorno, sin redespliegue (criterio 3) — mismo patrón que `IngestionConfig` (HU-01).

**Diferido:** criterios 4 y 5 (abrir el detalle de la convocatoria al tocar la notificación, incluso con la app cerrada) son responsabilidad del adaptador móvil (deep link) — el propio diseño de la historia en Jira ya lo declara así: "El deep link es responsabilidad del adaptador móvil, la resolución del destino es del dominio". El dominio expone `convocatoriaId` en cada `PendingNotification` para que ese adaptador lo resuelva; no hay nada de dominio backend que falte.

### HU-19 — Aviso anticipado al vencimiento según la preferencia del estudiante (RF-27, RNF-03, RF-62)

El planificador de avisos de vencimiento que HU-18, HU-38 y HU-21 llevaban documentando como dependencia pendiente.

**Diseño — sin timers por aviso individual.** La alternativa obvia (al publicarse o corregirse una convocatoria, agendar un `setTimeout` por cada `(estudiante, convocatoria, umbral)`) se descartó: un proceso reiniciado perdería todos los timers en memoria, y una implementación persistente de "timers durables" es una pieza de infraestructura mucho más grande que lo que pide la historia. En su lugar, `EmitDueDateReminders` es un poller (`DueDateReminderScheduler`, mismo patrón `setTimeout` encadenado que `IngestionScheduler` de HU-01) que, en cada ciclo, relee el estado *vigente* de toda convocatoria con fecha de cierre concreta y decide en ese instante si corresponde emitir cada aviso. Esta elección resuelve dos criterios sin lógica adicional:

- **Criterio 3** (recalcular al corregir la fecha de cierre): como el cierre se lee fresco en cada ciclo (`DueDateConvocatoriaSourcePort`), una corrección ya está reflejada en el siguiente ciclo. Lo único que hace falta es que la idempotencia (ver abajo) no confunda "ya avisado para el cierre viejo" con "ya avisado para el cierre nuevo".
- **Criterios 4 y 5** (no emitir si la convocatoria está retirada/vencida, o si el estudiante desactivó la categoría): se verifican en el instante de emisión, no al "programar" — mismo principio que HU-46 ya aplica al rol de la cuenta ("nunca se cachea, se lee fresco en cada llamada").

**Idempotencia.** Sin ningún registro, cada ciclo posterior al instante de un aviso lo volvería a producir (el poller no tiene memoria propia de "esto ya se disparó"). `EmittedReminderRegistryPort` es esa memoria: antes de producir un `PendingNotification`, el caso de uso pregunta si ya se emitió para `(estudiante, convocatoria, umbral, cierre-vigente)`. Incluir el cierre vigente en la clave (no solo estudiante+convocatoria+umbral) es lo que resuelve el criterio 3 sin ninguna invalidación explícita: si el cierre cambia, la clave cambia, y ese aviso se trata como nunca emitido.

**Piezas nuevas:**

- **`AnticipationThreshold`** (dominio, value object): una anticipación en minutos, validada (positiva, finita). "Los umbrales son value objects" lo pide el propio diseño de la historia en Jira.
- **`NotificationScheduler`** (dominio, servicio puro): dado un cierre concreto, el instante actual y los umbrales aplicables (los del sistema + el del estudiante), calcula los instantes en que corresponde avisar (criterio 1), sin I/O y sin decidir destinatarios ni si todavía corresponde emitir. **Criterio 6** es una rama explícita, no un efecto colateral: un umbral cuyo instante ya pasó (queda menos tiempo para el cierre que la propia anticipación) se resuelve con `firesAt = now` e `immediate = true`, para que el aviso se emita de inmediato en vez de perderse.
- **`computeUrgency`** (dominio, función pura): mayor urgencia cuanto menos tiempo falta para el cierre — compartida con HU-20 para que ambas produzcan `PendingNotification` comparables en un mismo lote de `NotificationBatchingPolicy` (HU-21).
- **`EmitDueDateReminders`** (aplicación): el caso de uso descrito arriba. Depende directamente de `ClassificationResultRepositoryPort` (`classification`) y `ProgramTargetingRepositoryPort`/`FacultyProgramResolver`/`targetingIncludesProgram` (`targeting`) — mismo patrón de composición directa entre contextos en la capa de aplicación que ya usa `GetSegmentedFeed` (`feed`) para el mismo tipo de lectura; no se envuelven en un puerto propio porque ya son puertos de salida (abstracción de infraestructura), no un tipo de dominio ajeno. El público de un aviso de vencimiento es el mismo que vería la convocatoria en el feed (targeting del programa), no *todos* los estudiantes: una decisión de diseño no exigida literalmente por los criterios de HU-19 (que no mencionan programa), pero coherente con "no avisar de un plazo a quien nunca vería esa oportunidad".
- **`DueDateConvocatoriaSourcePort`** (dominio, puerto propio) + `MongoDueDateConvocatoriaSource`/`InMemoryDueDateConvocatoriaSource` (infraestructura): lo mínimo que hace falta de una convocatoria (`convocatoriaId`, `representativeMessageId`, `dueAt`, `withdrawn`) para decidir si corresponde avisar. No se reutiliza `ConsolidatedMessageRegistryPort` de `ingestion` porque le falta un método de enumeración y este contexto no debe modificar `ingestion`; el adaptador Mongo lee la misma colección (`ingestion_consolidated_messages`) de forma independiente — mismo patrón que ya usa `feed` con `ConvocatoriaRepositoryPort`/`MongoConvocatoriaRepository` para el mismo problema.
- **`StudentDirectoryPort`** (dominio, puerto propio) + `ProfileStudentDirectoryAdapter` (infraestructura): declara lo que `notifications` necesita de `profile` (`studentId`, `programId`) con tipos propios — mismo patrón que `ConsentStatusPort`/`ConsentStatusAdapter` de HU-44 (`identity` → `consent`), aquí en la dirección `notifications` → `profile`. `profile` no tenía ninguna forma de listar estudiantes (solo `findByEmail`); se amplió `StudentProfileRepositoryPort` de forma aditiva con `findAll()` — mismo estilo que `NotificationSchedulingPort` ganó `cancelScheduledNotifications` en HU-50 — y el adaptador de `notifications` proyecta cada `StudentProfile` a `StudentDirectoryEntry` en la frontera.
- **`EmittedReminderRegistryPort`** (dominio, puerto propio) + `InMemoryEmittedReminderRegistry`/`MongoEmittedReminderRegistry` (infraestructura): el registro de idempotencia descrito arriba.
- **`DueDateReminderConfig`** / **`DueDateReminderScheduler`**: intervalo del poller (`DUE_DATE_REMINDER_POLL_INTERVAL_MS`, por defecto 30s) y umbrales del sistema (`DUE_DATE_REMINDER_SYSTEM_THRESHOLDS_MINUTES`, por defecto 1 día) configurables sin redespliegue, mismo patrón que `NotificationBatchingConfig` (HU-21). El intervalo se valida contra el máximo de 60 segundos que exige el criterio 2: un valor mayor se rechaza al leer la configuración, no falla en silencio.

Wire-up en `src/main.ts`: `EmitDueDateReminders` corre en un `DueDateReminderScheduler` propio, en paralelo al `IngestionScheduler`, ambos detenidos en `SIGTERM`/`SIGINT`.

### HU-20 — Aviso de nueva convocatoria pertinente al programa del estudiante (RF-28, RF-61, RF-74)

**El "evento de dominio `ConvocatoriaPublished`" que menciona el diseño de la historia en Jira ya existía como infraestructura antes de esta historia, solo sin implementación real.** No hay `DomainEvent`/`EventBus` en ningún contexto de este proyecto, y el patrón ya establecido para "un caso de uso dispara efectos en otro contexto" es composición directa de casos de uso/puertos (`AuthenticateStudent` con `ConsentStatusPort`, HU-44). `classification` ya había declarado `NotificationSchedulingPort` desde HU-10, con un comentario explícito en el propio archivo: *"stub de HU-20"*. `ClassifyInstitutionalMessage` (ingesta automática), `CorrectClassification` (HU-11, correción manual) y, a través de ella, `PublishReviewQueueItem` (HU-49, "publicar sin cambios" en la cola de revisión) y `PublishConvocatoria` (HU-50, publicación manual del administrador) ya invocaban `scheduleForPublication` al llegar a `publicationStatus: 'published'` — los cuatro puntos de entrada convergían en el mismo puerto, implementado hasta ahora por un stub en memoria que solo registraba la llamada. Por eso **esta historia no modifica ni `ingestion`, ni `classification`, ni `moderation`**: solo construye la implementación real de ese puerto, que es exactamente "mismo caso de uso, mismo evento" (criterio 5).

- **`NotifyProgramTargetedPublication`** (aplicación): el caso de uso — único suscriptor de "una convocatoria se publicó". Resuelve el targeting de la convocatoria (`ProgramTargetingRepositoryPort`, con `allCommunityTargeting()` si no hay registro — criterio 3), cruza contra todos los estudiantes (`StudentDirectoryPort`, HU-19) filtrando por `targetingIncludesProgram` (criterio 1) y por `NotificationPreferencesPolicy.isCategoryEnabled` (criterios 2 y 3), y produce un `PendingNotification` por estudiante que pasa ambos filtros. Depende directamente de `ConsolidatedMessageRegistryPort` (`ingestion`) para resolver el `convocatoriaId`, la fecha de cierre (para la urgencia) y el estado de retiro — mismo patrón de composición directa en la capa de aplicación que `PublishConvocatoria`/`CorrectClassification` ya usan para cruzar `ingestion` ↔ `classification` ↔ `targeting`.
- **`NotificationSchedulingAdapter`** (infraestructura): implementa `NotificationSchedulingPort` (declarado por `classification`) delegando en `NotifyProgramTargetedPublication` — mismo sentido de dependencia que `ConsentStatusAdapter` pero en espejo (allá `identity` declara y `consent` implementa vía un adaptador de `identity`; aquí `classification` declara y `notifications` implementa vía un adaptador de `notifications`). Sustituye a `InMemoryNotificationSchedulingPort` en la raíz de composición (`main.ts`); ese stub se conserva para las pruebas propias de `classification`/`ingestion` que no necesitan un planificador real. `cancelScheduledNotifications` queda como no-op documentado: ni HU-19 ni HU-20 dejan ningún aviso "programado" con estado propio que cancelar — ambas releen el estado vigente en cada invocación/ciclo, así que una convocatoria retirada deja de generar avisos nuevos sin que nadie tenga que cancelar nada explícitamente.
- **Criterio 4** (revisión pendiente no notifica) no necesita código propio: lo garantiza el punto de enganche elegido. `scheduleForPublication` solo se invoca donde `publicationStatus` pasa a `'published'`; un documento en `'pending-review'` nunca llega a este puerto.

**Diferido:** ninguno — los 5 criterios de HU-20 quedan cubiertos (ver tabla más abajo). Como en el resto de este contexto, "notificar" termina en `PendingNotification`, no en un push real entregado al dispositivo — eso sigue esperando el futuro `PushProviderPort` de HU-18.

## Estructura

    src/contexts/notifications/
      domain/          DeviceRegistration, NotificationPreferences, NotificationPreferencesPolicy, PendingNotification,
                        NotificationBatchingPolicy, AnticipationThreshold, NotificationScheduler, puertos (in/out).
      application/     RegisterDevice, InvalidateDevice, ListActiveDevices, UpdateNotificationPreferences,
                        GetNotificationPreferences, EmitDueDateReminders (HU-19), NotifyProgramTargetedPublication (HU-20).
      infrastructure/  adaptadores en memoria y MongoDB, configuración de agrupación de avisos y de avisos de
                        vencimiento, planificador (scheduler) de avisos de vencimiento, reloj.

Parcialmente conectado a `src/main.ts` (raíz de composición): HU-19 (`EmitDueDateReminders` en su propio `DueDateReminderScheduler`) y HU-20 (`NotificationSchedulingAdapter`, cableado como el `notificationSchedulingPort` real de `ClassifyInstitutionalMessage`) ya corren en producción. Lo que sigue sin existir es una capa HTTP propia: el estudiante todavía no tiene un endpoint desde el cual registrar su dispositivo (HU-18) o ajustar sus preferencias (HU-38) — esas dos historias siguen sin wire-up en `main.ts`.

## Criterios de aceptación y dónde se verifican

### HU-18

| Criterio | Estado | Prueba |
|---|---|---|
| 1. Registro asociado a la cuenta al conceder el permiso | Cubierto | `DeviceUseCases.test.ts`, `MongoDeviceRegistry.integration.test.ts` |
| 2. Rotación del identificador sin duplicar entradas | Cubierto | `DeviceUseCases.test.ts`, `MongoDeviceRegistry.integration.test.ts` |
| 3. El cierre de sesión invalida el registro | Cubierto | `DeviceUseCases.test.ts`, `MongoDeviceRegistry.integration.test.ts` |
| 4. Un aviso llega a todos los dispositivos vigentes | Cubierto | `DeviceUseCases.test.ts`, `MongoDeviceRegistry.integration.test.ts` |
| 5. Un identificador invalido reportado por el proveedor se depura | Cubierto | `DeviceUseCases.test.ts`, `MongoDeviceRegistry.integration.test.ts` |
| 6. Denegar el permiso no degrada el resto de la app | Diferido | Comportamiento del cliente móvil, sin contraparte de dominio |

### HU-38

| Criterio | Estado | Prueba |
|---|---|---|
| 1. Activar/desactivar cada categoría de forma independiente | Cubierto | `NotificationPreferencesPolicy.test.ts`, `PreferencesUseCases.test.ts` |
| 2. Categoría desactivada no emite notificación | Cubierto | `NotificationPreferencesPolicy.test.ts` |
| 3. Los avisos se programan con la anticipación seleccionada | Cubierto (almacenamiento/validación; disparar el aviso según la fecha es de HU-20) | `PreferencesUseCases.test.ts` |
| 4. Avisos ya programados se recalculan al cambiar la anticipación | Cubierto (por diseño: HU-19 relee la preferencia vigente en cada ciclo) | `EmitDueDateReminders.test.ts` |
| 5. Anticipación fuera de catálogo se rechaza en el servidor | Cubierto | `NotificationPreferencesPolicy.test.ts`, `PreferencesUseCases.test.ts`, `MongoNotificationPreferencesRepository.integration.test.ts` |
| 6. El tema se conserva entre sesiones | Cubierto | `PreferencesUseCases.test.ts`, `MongoNotificationPreferencesRepository.integration.test.ts` |
| 7. Contraste AA y escalado de fuente | Diferido | Accesibilidad del cliente móvil, sin contraparte de dominio |

### HU-21

| Criterio | Estado | Prueba |
|---|---|---|
| 1. Avisos coincidentes en la misma ventana se agrupan en uno con resumen | Cubierto | `NotificationBatchingPolicy.test.ts` |
| 2. Al superar el límite diario, el resto se difiere sin perderse | Cubierto | `NotificationBatchingPolicy.test.ts` |
| 3. El límite diario se ajusta sin redespliegue | Cubierto | `NotificationBatchingConfig.test.ts` |
| 4. Tocar la notificación abre el detalle de la convocatoria | Diferido | Deep link del adaptador móvil |
| 5. Notificación tocada con la app cerrada navega tras autenticación | Diferido | Comportamiento del cliente móvil |
| 6. Un aviso diferido se emite en la ventana siguiente conservando su prioridad | Cubierto | `NotificationBatchingPolicy.test.ts` |

### HU-19

| Criterio | Estado | Prueba |
|---|---|---|
| 1. Se generan avisos en los umbrales del sistema y en el elegido por el estudiante | Cubierto | `NotificationScheduler.test.ts`, `EmitDueDateReminders.test.ts` |
| 2. El aviso se emite dentro de los 60 segundos siguientes a su instante previsto | Cubierto (el poller corre cada ≤60s por configuración validada) | `DueDateReminderConfig.test.ts`, `DueDateReminderScheduler.test.ts` |
| 3. Corregir la fecha de cierre recalcula los avisos programados | Cubierto | `EmitDueDateReminders.test.ts` |
| 4. Convocatoria retirada o vencida no emite el aviso pendiente | Cubierto | `EmitDueDateReminders.test.ts` |
| 5. Categoría desactivada no emite el aviso | Cubierto | `EmitDueDateReminders.test.ts` |
| 6. Menos tiempo restante que el umbral emite de inmediato | Cubierto | `NotificationScheduler.test.ts`, `EmitDueDateReminders.test.ts` |

### HU-20

| Criterio | Estado | Prueba |
|---|---|---|
| 1. Convocatoria publicada dirigida al programa notifica al estudiante | Cubierto | `NotifyProgramTargetedPublication.test.ts` |
| 2. Categoría desactivada no notifica aunque aplique al programa | Cubierto | `NotifyProgramTargetedPublication.test.ts` |
| 3. Contenido a toda la comunidad respeta la preferencia de categoría | Cubierto | `NotifyProgramTargetedPublication.test.ts` |
| 4. Revisión pendiente no notifica hasta publicarse | Cubierto (por el punto de enganche: el puerto solo se invoca al pasar a `published`) | `NotificationSchedulingAdapter.test.ts` |
| 5. Publicación manual dispara el mismo flujo que la automática | Cubierto | `NotificationSchedulingAdapter.test.ts`, `NotifyProgramTargetedPublication.test.ts` |
