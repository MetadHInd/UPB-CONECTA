# UPB Conecta, contexto de notificaciones

> Documentación específica de este contexto acotado. Para la visión general del proyecto y la arquitectura, ver el [README raíz](../../../README.md).

Implementación de **HU-18 (SCRUM-30): Registro y ciclo de vida del dispositivo para entrega de notificaciones** — **parcial**: criterios 1-5 — y **HU-38 (SCRUM-50): Preferencias de notificación por categoría, anticipación de avisos y tema visual** — **parcial**: criterios 1, 2, 3, 5 y 6. Trazabilidad: RF-26, RF-64, RF-61, RF-62, RF-63, RNF-38.

Segundo contexto del backend fuera de `ingestion` (junto a `consent`), mismo patrón hexagonal. Ambas historias son piezas que un futuro planificador de avisos (HU-20/HU-21, no implementadas) consumirá: HU-18 le dice a *quién* enviar, HU-38 le dice *si* debe enviar y *con cuánta anticipación*.

## Alcance: qué cubre cada historia y qué queda diferido

### HU-18 — Registro de dispositivos

Es sobre el **registro**, no sobre el envío de avisos: eso es responsabilidad de HU-20/HU-21, que consumirán `ListActiveDevices` para saber a quién enviar y un futuro `PushProviderPort` (mencionado en el propio diseño de la historia en Jira) para enviar de verdad. Aquí no se construye ningún `PushProviderPort` — no hay nada que enviar todavía.

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

**Diferido:**
- **Criterio 4** (recalcular los avisos ya programados al cambiar la anticipación): no existe todavía ningún planificador que programe avisos — no hay nada que recalcular. Cuando exista, consultará `GetNotificationPreferences` antes de programar cada aviso, así que un cambio de anticipación ya se refleja en lo próximo que se programe; la recalculación de lo *ya* programado es responsabilidad de esa futura historia.
- **Criterio 7** (contraste AA y escalado de fuente del sistema operativo): es enteramente de interfaz/accesibilidad del cliente móvil, sin contraparte de dominio backend.

## Estructura

    src/contexts/notifications/
      domain/          DeviceRegistration, NotificationPreferences, NotificationPreferencesPolicy, puertos (in/out).
      application/     RegisterDevice, InvalidateDevice, ListActiveDevices, UpdateNotificationPreferences, GetNotificationPreferences.
      infrastructure/  adaptadores en memoria y MongoDB, reloj.

No está conectado a `src/main.ts` (raíz de composición del scheduler de *ingesta*): este contexto no tiene todavía un proceso ni una capa HTTP propia desde la cual el estudiante registre su dispositivo o ajuste sus preferencias.

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
| 3. Los avisos se programan con la anticipación seleccionada | Cubierto (almacenamiento/validación; la programación real es de HU-20/21) | `PreferencesUseCases.test.ts` |
| 4. Avisos ya programados se recalculan al cambiar la anticipación | Diferido | No existe planificador todavía |
| 5. Anticipación fuera de catálogo se rechaza en el servidor | Cubierto | `NotificationPreferencesPolicy.test.ts`, `PreferencesUseCases.test.ts`, `MongoNotificationPreferencesRepository.integration.test.ts` |
| 6. El tema se conserva entre sesiones | Cubierto | `PreferencesUseCases.test.ts`, `MongoNotificationPreferencesRepository.integration.test.ts` |
| 7. Contraste AA y escalado de fuente | Diferido | Accesibilidad del cliente móvil, sin contraparte de dominio |
