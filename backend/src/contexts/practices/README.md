# Contexto de prácticas (HU-22, HU-23, HU-24)

> Documentación específica de este contexto acotado. Para la visión general del proyecto y la arquitectura, ver el [README raíz](../../../README.md).

**HU-24 (SCRUM-36): carga manual de ofertas de práctica por el administrador.** Trazabilidad: RF-36, RF-74, RNF-15, RNF-18. Épica EP-05, módulo de prácticas.

## Alcance

El administrador de contenido registra una oferta de práctica que no llegó por correo, con los mismos campos que el proceso automático. La oferta sigue el mismo camino que una ingerida: feed segmentado, aviso de publicación, avisos de vencimiento y auditoría. También puede editarla y retirarla.

Igual que HU-30, HU-35 y HU-50, no hay servidor HTTP ni formulario real. Se entregan los casos de uso que ese formulario invocará, con la validación en el servidor.

| Pieza | Capa | Rol |
|---|---|---|
| `PracticeOfferDetails`, `PracticeModality`, `practiceOfferSubject` | Dominio | Lo propio de una práctica: empresa, requisitos, modalidad |
| `validateNewPracticeOffer`, `validatePracticeOfferChanges` | Dominio (servicio) | Validación en servidor, campo por campo (criterio 3) |
| `PracticeOfferRepositoryPort`, `ClockPort` | Puertos | |
| `PublishPracticeOffer` | Aplicación | Publicar (criterios 1 a 4) sobre `PublishConvocatoria` |
| `EditPracticeOffer` | Aplicación | Editar (criterio 5) sobre `EditConvocatoria` |
| `WithdrawPracticeOffer` | Aplicación | Retirar (criterio 5) sobre `WithdrawConvocatoria` |
| `InMemory`/`MongoPracticeOfferRepository` | Infraestructura | Colección `practice_offers` |
| `EditConvocatoria` + evento `EDITED` | `ingestion` (nuevo) | La edición de cualquier convocatoria, con auditoría |

## Decisiones

### 1. La oferta extiende la convocatoria, no la duplica

El diseño de HU-22 dice: "`OfertaPractica` extiende el agregado Convocatoria. Un único caso de uso de publicación para ambas fuentes". El de HU-24 dice: "el backoffice es driving adapter sobre el mismo caso de uso `PublishConvocatoria`. No hay ruta de escritura alterna al dominio".

Por eso cada campo del formulario vive donde ya vive para una oferta ingerida:

| Campo del formulario | Dónde queda | Quién ya lo lee |
|---|---|---|
| Descripción | `body` del registro consolidado (`ingestion`) | Feed, detalle (HU-15) |
| Programas destinatarios | `ProgramTargeting` (`targeting`) | Feed (HU-12), avisos (HU-19/20) |
| Fecha de cierre | `dueDate` del registro consolidado | Feed, planificador de vencimiento (HU-19) |
| Canal de postulación | `applicationLink` del registro consolidado | Detalle (HU-15) |
| Categoría | `practica` en `classification` | Preferencias de aviso (HU-38) |
| Empresa, requisitos, modalidad | `practice_offers` (este contexto), por `messageId` | HU-22 (listado y detalle de prácticas) |

`PublishPracticeOffer` no escribe en `ingestion`, `classification` ni `targeting`: invoca `PublishConvocatoria` (HU-50), igual que `PublishReviewQueueItem` (HU-49) reutiliza `CorrectClassification`.

**Nota sobre "los mismos campos que el proceso automático":** la ingesta automática todavía no extrae empresa, requisitos ni modalidad de un correo (solo cuerpo, fecha de cierre y enlace, HU-02/HU-08). Esta historia define dónde viven esos tres campos. Cuando la extracción automática exista, debe guardarlos en `practice_offers` para que HU-22 muestre las dos fuentes igual.

### 2. Validación en servidor, todos los problemas a la vez (criterio 3)

El formulario llega como un cuerpo sin tipo, igual que en `CreatePost` (HU-30). La validación devuelve **todos** los problemas en una sola respuesta, cada uno con su campo (`issues: [{ field, message }]`), para que el administrador corrija de una vez. Qué se valida:
- Los siete campos son obligatorios.
- Los textos tienen un límite de longitud.
- La modalidad debe ser presencial, remota o híbrida.
- Los programas y facultades deben existir en el catálogo institucional.
- La fecha de cierre debe ser válida y futura: una oferta cerrada no le llega a nadie.
- El canal de postulación debe ser un enlace `http(s)` o un correo, que se guarda como `mailto:`.
- Los campos desconocidos se rechazan.

Además, el texto libre se neutraliza con `neutralizeHtml` (HU-47, criterio 7).

### 3. La empresa no se edita

El asunto de la convocatoria ("Oferta de práctica en *empresa*") forma parte de `ConvocatoriaId` (remitente, asunto y fecha del primer envío). Esa es la clave con la que el registro consolidado, el feed, el detalle y lo guardado por el estudiante (HU-16) identifican la convocatoria. Cambiar la empresa crearía otra convocatoria. Otra empresa es otra oferta: se retira esta y se publica una nueva. La edición lo rechaza con un mensaje que lo explica.

### 4. Editar: `EditConvocatoria` en `ingestion`

No existía forma de editar una convocatoria publicada. Para no abrir una ruta de escritura alterna, se agregó `EditConvocatoria` a `ingestion`, junto a `PublishConvocatoria` y `WithdrawConvocatoria`. Edita el cuerpo, la fecha de cierre, el enlace y la segmentación, y audita con el evento `EDITED` y los campos cambiados (`changedFields`).

Lo propio de la práctica (requisitos y modalidad) se guarda en `practice_offers`, y sus nombres viajan en `extensionChanges` para quedar en **la misma entrada de auditoría**. Una edición sin cambios reales no escribe ni audita. Una convocatoria retirada no se edita.

### 5. Recalcular los avisos al editar (criterio 5)

No hay nada que invalidar. El planificador de vencimiento (`EmitDueDateReminders`, HU-19) relee en cada ciclo la fecha de cierre y la segmentación vigentes, y su registro de idempotencia incluye la fecha de cierre en la clave. Al guardar una fecha o unos programas nuevos, el siguiente ciclo ya avisa según ellos. Las pruebas lo verifican con el planificador real:
- con la fecha movida, el aviso sale en el instante nuevo y no en el viejo;
- con los programas ampliados, los nuevos destinatarios reciben el aviso.

Al retirar, `WithdrawConvocatoria` cancela los avisos y el planificador deja de producirlos.

**Límite:** el aviso **de publicación** (HU-20) no se vuelve a enviar al ampliar los programas de una oferta ya publicada. Los programas nuevos la ven en el feed y reciben los avisos de vencimiento, pero no el "nueva oferta publicada". Reenviarlo a todos notificaría dos veces a quienes ya lo recibieron.

### 6. Retirar

`WithdrawPracticeOffer` pasa por `WithdrawConvocatoria` (HU-50), que la saca del feed, cancela los avisos y audita. La oferta no se borra: guarda `withdrawnAt`, para que HU-23 pueda avisar al estudiante que la seguía. Si la convocatoria ya se había retirado por la vía general de HU-50, retirarla aquí solo alinea la oferta, sin una segunda auditoría.

## Autorización (HU-46)

`PublishPracticeOffer`, `EditPracticeOffer`, `WithdrawPracticeOffer` y `EditConvocatoria` están declaradas con rol `content-admin` en `config/protected-operations.json`. `scripts/check-declared-authorization.mjs` ganó el verbo `Edit`.

## Colección MongoDB

- `practice_offers`: `_id = messageId`. Índice `idx_modality_withdrawn` `{ modality: 1, withdrawnAt: 1 }`, pensado para el filtro por modalidad de HU-22.

## Criterios de aceptación y pruebas

| # | Criterio | Pruebas |
|---|---|---|
| 1 | Mismos campos que el proceso automático | `tests/practices/PracticeOfferBackoffice.test.ts` › criterio 1 |
| 2 | Entra al mismo flujo de segmentación y notificación | › criterio 2 (feed segmentado real, aviso de publicación y planificador de vencimiento real) |
| 3 | Validación en servidor indicando qué falta | › criterio 3 (campos faltantes y 12 casos de valores inválidos, sin guardar nada) |
| 4 | Auditoría de administrador, acción y marca de tiempo | › criterio 4; `tests/infrastructure/mongo/MongoPracticeOffers.integration.test.ts` |
| 5 | Editar o retirar recalcula los avisos y se audita | › criterio 5 (fecha movida, programas ampliados, campos de práctica auditados, empresa no editable, retiro); integración Mongo |

Mutaciones comprobadas: publicar con otra categoría hace fallar 2 pruebas; no guardar la segmentación al editar, 1; no auditar los campos propios de la práctica, 1; aceptar una fecha pasada, 2; retirar sin pasar por `WithdrawConvocatoria`, 1.

## HU-22 (SCRUM-34): listado consolidado, filtros y detalle

**Trazabilidad:** RF-31, RF-32, RF-33. Sin servidor HTTP ni cliente móvil: se entregan los casos de uso que esa capa invocará.

| Pieza | Capa | Rol |
|---|---|---|
| `PracticeOfferListItem`, `PracticeOfferDetail`, `PracticeOfferStatus` | Dominio | Modelo de lectura, con estado explícito `abierta`/`cerrada` |
| `PracticeConvocatoriaSourcePort` | Puerto | Fuente única: no distingue si la oferta llegó por correo o se cargó a mano |
| `PracticeListingPolicy` | Dominio (servicio) | Qué se lista, filtros combinables, orden, estado y campos no informados |
| `PracticeDuplicatePolicy` + `config/practice-listing-policy.json` | Dominio + datos | Cuándo una carga manual es una oferta ya registrada |
| `ListPracticeOffers`, `GetPracticeOfferDetail` | Aplicación | Listado con filtros y detalle |
| `PublishPracticeOffer` (extendido) | Aplicación | Consolida duplicados antes de publicar |
| `CompositePracticeConvocatoriaSource` | Infraestructura | Une registro consolidado, clasificación, segmentación y `practice_offers`, en lote |

### Decisiones

1. **Una sola fuente, sin campo de origen.** Las dos vías ya escriben en los mismos repositorios (la ingesta directamente; la carga manual por `PublishConvocatoria`). El listado lee la clasificación con categoría `practica` y resuelve el resto en lote. El modelo no tiene campo de origen y el id de una oferta manual ya no lleva el prefijo `manual-` (`RandomManualMessageIdGenerator`); los ids emitidos antes lo conservan.
2. **Estado.** `cerrada` solo si hay fecha de cierre anterior a ahora (mismo límite que HU-15). Sin fecha o con fecha ambigua queda `abierta`; `dueDate` conserva el matiz. Por defecto solo se listan las abiertas; `status=cerrada` o `todas` las incluye, con las vigentes primero (criterio 4). No se listan las retiradas ni las retenidas para revisión.
3. **Filtros.** Programa (incluye lo dirigido al programa, a su facultad o a toda la comunidad), modalidad y estado, combinables. Un valor desconocido se rechaza por campo; uno vacío se ignora. Con filtro de modalidad, una oferta sin modalidad conocida no coincide.
4. **Consolidación (criterio 5).** Al cargar a mano, `PublishPracticeOffer` busca duplicados: primero el mismo canal de postulación (URL normalizada: dominio en minúsculas, sin barra final, fragmento, parámetros `utm_*` ni puerto por defecto; correo como `mailto:`), luego la misma empresa (sin tildes ni sufijo legal) con cierre a menos de 24 h. Las reglas viven en `config/practice-listing-policy.json`. Si hay coincidencia no crea otro registro: completa el existente vía `EditConvocatoria` (auditado como `EDITED`) y conserva su identidad. Lo que diligencia el administrador prevalece sobre lo extraído del correo. Una oferta retirada no absorbe una carga nueva.

### Limitaciones explícitas

- **La ingesta no extrae empresa, requisitos ni modalidad.** Una oferta ingerida sin completar sale con `company`, `requirements` y `modality` en `null` y `missingFields` los nombra; el cliente debe mostrar "no informado". No se inventa ningún dato.
- **Una oferta ingerida no se filtra por modalidad** hasta que se complete: no se puede afirmar que sea de una modalidad.
- **Solo se consolida en el sentido ingesta → carga manual.** Si la carga manual va primero y el correo llega después, la ingesta (deduplicación por remitente y asunto, HU-03) crea otro registro. Consolidarlo requiere que la ingesta consulte `findDuplicateOffer`.
- **El duplicado se detecta por el canal de postulación.** Una oferta ingerida sin enlace en el cuerpo, o con otro enlace, no se detecta.
- **Las ofertas ingeridas sin clasificación** (anteriores a HU-06) no se listan: no se sabe que son prácticas.
- **El listado carga todas las prácticas y filtra en memoria.** Aceptable con el volumen esperado de la oferta de prácticas; si crece, el filtro de estado y modalidad se empuja a Mongo.
- **Sin ruta de retiro para una oferta ingerida sin completar** en `WithdrawPracticeOffer` (solo conoce `practice_offers`); se retira con `WithdrawConvocatoria` (HU-50).

### Criterios de aceptación y pruebas

| # | Criterio | Pruebas |
|---|---|---|
| 1 | Un listado único, sin distinción de origen | `tests/practices/PracticeOfferListing.test.ts` › criterio 1 (ingesta real más carga manual; misma forma, sin campos de origen) |
| 2 | Filtros por programa, modalidad y estado, combinables | › criterio 2; integración Mongo |
| 3 | Detalle con empresa, descripción, requisitos, modalidad, cierre y canal | › criterio 3 (oferta manual completa; oferta ingerida con `missingFields`) |
| 4 | Cerrada distinguible y no mezclada | › criterio 4 |
| 5 | Ingerida y luego cargada a mano, un solo registro | › criterio 5; `PracticeDuplicatePolicy.test.ts`; `MongoPracticeListing.integration.test.ts` |

## HU-23 (SCRUM-35): seguimiento personal del estado de postulación y recordatorio de cierre

**Trazabilidad:** RF-34, RF-35, RNF-20. Igual que HU-22 y HU-24, no hay servidor HTTP ni cliente móvil: se entregan los casos de uso que esa capa invocará.

| Pieza | Capa | Rol |
|---|---|---|
| `PracticeApplicationTracking`, `PracticeApplicationStatus` | Dominio | Seguimiento privado estudiante-oferta, con historial de cambios |
| `PracticeTrackingPolicy` | Dominio (servicio) | Validar el estado, situación de la oferta seguida, agrupar por estado |
| `PracticeApplicationTrackingRepositoryPort` | Puerto | |
| `TrackPracticeApplication` | Aplicación | Registrar o cambiar el estado (criterios 1 y 2) |
| `GetPracticeApplicationTracking` | Aplicación | Vista agrupada por estado, con aviso de retiro (criterios 5 y 6) |
| `InMemory`/`MongoPracticeApplicationTrackingRepository` | Infraestructura | Colección `practice_application_tracking` |
| `ConvocatoriaFollowersPort` + `PracticeTrackingFollowersAdapter` | `notifications` | Suma a los seguidores al público del recordatorio de cierre (criterio 3) |

### Decisiones

1. **Entidad de relación, no campo de la oferta.** Igual que el estado personal de HU-16: el seguimiento vive en su propia colección por `studentId|offerId`. La oferta no sabe quién la sigue. `offerId` es el mismo del listado de HU-22 (`representativeMessageId`).
2. **Estados.** `interesado`, `postulado`, `en-proceso` y `cerrado`. Cualquier otro valor se rechaza sin guardar nada. Los cambios son libres entre los cuatro: el estudiante lleva su propio registro y el sistema no le impone un orden.
3. **Marca de tiempo e historial (criterio 2).** Cada cambio se agrega a `history` con su instante; `updatedAt` es el del último. Repetir el estado vigente no escribe nada.
4. **Qué se puede seguir.** Empezar a seguir exige una práctica publicada y no retirada. Un seguimiento existente se puede actualizar aunque la oferta se haya retirado o cerrado, para darla por cerrada.
5. **Recordatorio (criterio 3).** No hay un planificador nuevo: `EmitDueDateReminders` (HU-19) suma al público de la segmentación a quienes siguen la convocatoria como `interesado` o `postulado`, mediante `ConvocatoriaFollowersPort` (una consulta por ciclo). Hereda todo lo de HU-19: la anticipación elegida por el estudiante, el aviso inmediato si queda menos tiempo que el umbral, no avisar de una convocatoria retirada o vencida y la idempotencia. Quien está en la segmentación y además la sigue recibe un solo aviso por umbral. `en-proceso` y `cerrado` no piden recordatorio (`wantsClosingReminder`).
6. **La categoría desactivada también silencia al seguidor.** Si el estudiante apagó los avisos de prácticas (HU-38), seguir una oferta no los reactiva. Es la misma regla de HU-19 criterio 5, sin excepción.
7. **Privacidad (criterio 4, RNF-20).** El listado y el detalle de HU-22 no leen el seguimiento, y ningún caso de uso lo expone a terceros ni al administrador: no hay operación administrativa sobre él. La única lectura por oferta (`findTrackingStudents`) la usa el planificador de avisos. `studentId` sale de la sesión autenticada (HU-43), nunca del cuerpo de la petición. El seguimiento es dato personal: `ApplicationTrackingDataSource` (HU-48) lo incluye en la consulta y la supresión del titular.
8. **Oferta retirada (criterio 6).** La vista conserva la postulación con `situation: 'retirada'`, `withdrawnAt` y un aviso que lo explica, sin importar si se retiró por el backoffice de prácticas o por `WithdrawConvocatoria` (HU-50). Si la oferta deja de figurar como práctica (reclasificada, archivada por retención o devuelta a revisión) queda como `no-disponible` con su propio aviso. El título y la empresa se copian al empezar a seguir, para que el estudiante sepa cuál era.

### Limitaciones explícitas

- **El aviso de retiro se muestra en la vista, no llega como notificación.** `PendingNotification` no distingue tipos de aviso y el envío real (push) todavía no existe (HU-18). Cuando exista, el retiro puede avisar a los seguidores desde `NotificationSchedulingAdapter.cancelScheduledNotifications`.
- **La vista carga todas las prácticas y cruza en memoria**, igual que el listado de HU-22.
- **No hay forma de dejar de seguir** una oferta: `cerrado` cumple ese papel. Borrar el seguimiento solo ocurre por supresión (HU-48).

### Colección MongoDB

- `practice_application_tracking`: `_id = studentId|offerId`. Índices `idx_student_updated` `{ studentId: 1, updatedAt: -1 }` (vista del estudiante) e `idx_offer_status` `{ offerId: 1, status: 1 }` (seguidores por ciclo del planificador).

### Criterios de aceptación y pruebas

| # | Criterio | Pruebas |
|---|---|---|
| 1 | Seleccionar interesado, postulado, en proceso o cerrado | `tests/practices/PracticeApplicationTracking.test.ts` › criterio 1 |
| 2 | Cambio persistido con marca de tiempo y visible en el seguimiento | › criterio 2; `tests/infrastructure/mongo/MongoPracticeApplicationTracking.integration.test.ts` |
| 3 | Recordatorio de cierre según la anticipación | › criterio 3 (planificador real de HU-19: fuera de la segmentación, anticipación propia, estados sin aviso, sin duplicar, categoría desactivada, retirada); integración Mongo |
| 4 | Invisible para terceros y para el administrador | › criterio 4 |
| 5 | Vista agrupada por estado | › criterio 5 |
| 6 | Oferta retirada informada en vez de desaparecer | › criterio 6 (backoffice de prácticas, HU-50 directo, oferta que deja de figurar); integración Mongo |

Mutaciones comprobadas: no sumar a los seguidores hace fallar 2 pruebas; ignorar el retiro, 3; no agregar al historial, 1; permitir seguir una oferta retirada, 1; avisar en todos los estados, 1.

## Pendientes

- **Extracción automática** de empresa, requisitos y modalidad desde el correo (decisión 1 de HU-24). Cuando exista, debe guardarlos en `practice_offers` y HU-22 los mostrará sin cambios.
- **Capa HTTP y cliente móvil** de HU-22 (listado, filtros, detalle) y de HU-23 (seguimiento).
- **Notificación del retiro** a quien seguía la oferta, cuando exista el envío real (ver limitaciones de HU-23).
- **Consolidar en sentido inverso** (carga manual y luego correo), ver limitaciones.
