# UPB Conecta, contexto de notificaciones

> Documentación específica de este contexto acotado. Para la visión general del proyecto y la arquitectura, ver el [README raíz](../../../README.md).

Implementación de **HU-38 (SCRUM-50): Preferencias de notificación por categoría, anticipación de avisos y tema visual** — **parcial**: criterios 1, 2, 3, 5 y 6. Trazabilidad: RF-61, RF-62, RF-63, RNF-38.

> Nota: este contexto también aloja **HU-18** (registro de dispositivos), desarrollada en paralelo en otra rama/PR. Si este README no menciona `DeviceRegistration`/`RegisterDevice` al leerlo, es porque ese PR todavía no se fusionó — al fusionar ambos, este archivo necesita conciliarse a mano (git lo marcará como conflicto porque los dos PRs lo crean desde cero).

## Alcance: qué cubre esta historia y qué queda diferido

`NotificationPreferences` es "entidad de dominio consultada por el planificador de avisos, no una configuración local del cliente" (diseño de la historia en Jira): vive en el servidor porque un futuro planificador de notificaciones (HU-20/HU-21, no implementadas) necesita consultarla antes de emitir cada aviso, no solo el cliente móvil.

- **`NotificationPreferences`** (dominio): categorías activas/inactivas (opt-out: una categoría nunca tocada está activa por defecto), anticipación de aviso, tema visual. `ALLOWED_LEAD_TIMES_MINUTES` fija el catálogo de anticipaciones admitidas (1h, 3h, 1 día, 3 días) — el ticket no los enumera, quedó como decisión de diseño ajustable sin tocar el resto del dominio.
- **`NotificationPreferencesPolicy`** (dominio): `isCategoryEnabled` (criterios 1, 2) y `assertValidLeadTime` (criterio 5, rechaza antes de persistir nada).
- **`UpdateNotificationPreferences`** / **`GetNotificationPreferences`** (aplicación): aplican solo los cambios recibidos sobre lo vigente (o los valores por defecto en el primer guardado); el tema y el resto de preferencias sobreviven entre sesiones porque el servidor es la fuente de verdad (criterio 6).
- **`NotificationPreferencesRepositoryPort`** + adaptadores en memoria y MongoDB: upsert por `studentId` — a diferencia de `consent` (append-only), aquí solo importa el estado vigente.

**Diferido:**
- **Criterio 4** (recalcular los avisos ya programados al cambiar la anticipación): no existe todavía ningún planificador que programe avisos — no hay nada que recalcular. Cuando exista (HU-20/21), consultará `GetNotificationPreferences` antes de programar cada aviso, así que un cambio de anticipación ya se refleja en lo próximo que se programe; la recalculación de lo *ya* programado es responsabilidad de esa futura historia.
- **Criterio 7** (contraste AA y escalado de fuente del sistema operativo): es enteramente de interfaz/accesibilidad del cliente móvil, sin contraparte de dominio backend.

## Estructura

    src/contexts/notifications/
      domain/          NotificationPreferences, NotificationPreferencesPolicy, puertos (in/out).
      application/     UpdateNotificationPreferences, GetNotificationPreferences.
      infrastructure/  adaptadores en memoria y MongoDB, reloj.

No está conectado a `src/main.ts` (raíz de composición del scheduler de *ingesta*): este contexto no tiene todavía un proceso ni una capa HTTP propia desde la cual el estudiante ajuste sus preferencias.

## Criterios de aceptación y dónde se verifican

| Criterio | Estado | Prueba |
|---|---|---|
| 1. Activar/desactivar cada categoría de forma independiente | Cubierto | `NotificationPreferencesPolicy.test.ts`, `PreferencesUseCases.test.ts` |
| 2. Categoría desactivada no emite notificación | Cubierto | `NotificationPreferencesPolicy.test.ts` |
| 3. Los avisos se programan con la anticipación seleccionada | Cubierto (almacenamiento/validación; la programación real es de HU-20/21) | `PreferencesUseCases.test.ts` |
| 4. Avisos ya programados se recalculan al cambiar la anticipación | Diferido | No existe planificador todavía |
| 5. Anticipación fuera de catálogo se rechaza en el servidor | Cubierto | `NotificationPreferencesPolicy.test.ts`, `PreferencesUseCases.test.ts`, `MongoNotificationPreferencesRepository.integration.test.ts` |
| 6. El tema se conserva entre sesiones | Cubierto | `PreferencesUseCases.test.ts`, `MongoNotificationPreferencesRepository.integration.test.ts` |
| 7. Contraste AA y escalado de fuente | Diferido | Accesibilidad del cliente móvil, sin contraparte de dominio |
