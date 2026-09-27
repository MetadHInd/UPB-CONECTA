# Contexto de prácticas (HU-24)

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

## Pendientes

- **HU-22** (listado y detalle de prácticas) debe leer `practice_offers` junto con la convocatoria. HU-24 la desbloquea.
- **Extracción automática** de empresa, requisitos y modalidad desde el correo (decisión 1).
- **Consolidar** una oferta cargada a mano con la misma ingerida por correo (HU-22, criterio 5).
