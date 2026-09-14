# UPB Conecta, contexto de notificaciones

> Documentación específica de este contexto acotado. Para la visión general del proyecto y la arquitectura, ver el [README raíz](../../../README.md).

Implementación de **HU-18 (SCRUM-30): Registro y ciclo de vida del dispositivo para entrega de notificaciones** — **parcial**: criterios 1-5. Trazabilidad: RF-26, RF-64.

Segundo contexto del backend fuera de `ingestion` (junto a `consent`), mismo patrón hexagonal.

## Alcance: qué cubre esta historia y qué queda diferido

HU-18 es sobre el **registro** de dispositivos, no sobre el envío de avisos: eso es responsabilidad de HU-20/HU-21 (todavía no implementadas), que consumirán `ListActiveDevices` para saber a quién enviar y un futuro `PushProviderPort` (mencionado en el propio diseño de la historia en Jira) para enviar de verdad. Aquí no se construye ningún `PushProviderPort` — no hay nada que enviar todavía.

- **`DeviceRegistration`** (dominio): entidad con estado `active`/`invalidated`. Invalidar conserva el registro (con la razón: `logout` o `delivery-failed`) en vez de borrarlo, consistente con el resto del proyecto (HU-04 hace lo mismo con la cuarentena) — permite diagnosticar por qué un dispositivo dejó de recibir avisos.
- **`RegisterDevice`** (aplicación): registra un token nuevo, o si el proveedor lo rotó (`previousToken`), actualiza el registro existente en el mismo lugar en vez de duplicarlo (criterios 1 y 2).
- **`InvalidateDevice`** (aplicación): cierre de sesión y fallo de entrega reportado por el proveedor llegan al mismo lugar del dominio — en ambos casos el dispositivo deja de ser un destino vigente (criterios 3 y 5).
- **`ListActiveDevices`** (aplicación): todos los dispositivos vigentes de un estudiante, para el abanico de un aviso (criterio 4).
- **`DeviceRegistryPort`** + adaptadores en memoria y MongoDB: `register`/`rotateToken` hacen upsert por `deviceToken` (`_id` en Mongo), que es lo que garantiza "sin duplicar entradas" sin una consulta previa.

**Diferido:** criterio 6 ("el estudiante deniega el permiso de notificaciones, las funciones restantes operan sin degradación y se le explica qué pierde") es comportamiento del cliente móvil — no hay una pieza de dominio backend que lo represente; el backend ya no depende de que exista un dispositivo registrado para nada más, así que la garantía de "sin degradación" ya se cumple por diseño (nada en el backend asume que un dispositivo existe), pero la explicación al usuario es responsabilidad de la app.

## Estructura

    src/contexts/notifications/
      domain/          DeviceRegistration, puertos (in/out). No importa infraestructura.
      application/     RegisterDevice, InvalidateDevice, ListActiveDevices.
      infrastructure/  adaptadores en memoria y MongoDB, reloj.

No está conectado a `src/main.ts` (raíz de composición del scheduler de *ingesta*): este contexto no tiene todavía un proceso propio que lo dispare (no hay HTTP desde el cual el cliente móvil registre su token).

## Criterios de aceptación y dónde se verifican

| Criterio | Estado | Prueba |
|---|---|---|
| 1. Registro asociado a la cuenta al conceder el permiso | Cubierto | `DeviceUseCases.test.ts`, `MongoDeviceRegistry.integration.test.ts` |
| 2. Rotación del identificador sin duplicar entradas | Cubierto | `DeviceUseCases.test.ts`, `MongoDeviceRegistry.integration.test.ts` |
| 3. El cierre de sesión invalida el registro | Cubierto | `DeviceUseCases.test.ts`, `MongoDeviceRegistry.integration.test.ts` |
| 4. Un aviso llega a todos los dispositivos vigentes | Cubierto | `DeviceUseCases.test.ts`, `MongoDeviceRegistry.integration.test.ts` |
| 5. Un identificador invalido reportado por el proveedor se depura | Cubierto | `DeviceUseCases.test.ts`, `MongoDeviceRegistry.integration.test.ts` |
| 6. Denegar el permiso no degrada el resto de la app | Diferido | Comportamiento del cliente móvil, sin contraparte de dominio |
