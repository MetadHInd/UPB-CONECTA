# UPB Conecta, contexto de consentimiento

> Documentación específica de este contexto acotado. Para la visión general del proyecto y la arquitectura, ver el [README raíz](../../../README.md).

Implementación de **HU-44 (SCRUM-56): Consentimiento informado de tratamiento de datos con registro versionado** — **parcial**: criterios 2, 4, 5 y 6. Trazabilidad: RF-71, RNF-23, Ley Estatutaria 1581 de 2012.

Primer contexto del backend fuera de `ingestion`, siguiendo el mismo patrón hexagonal (`domain/application/infrastructure`).

## Alcance: qué cubre esta historia y qué queda diferido

La historia completa exige que en el primer ingreso el sistema **presente** la política y **bloquee** el uso de funciones que tratan datos personales si el estudiante no acepta (criterios 1 y 3). Eso requiere una autenticación real (HU-43) y un punto de entrada HTTP que disparen ese flujo — ninguno existe todavía en este backend (mismo bloqueante que HU-04 criterio 5 y HU-55).

Lo que **sí** es independiente de HTTP/auth y se implementa aquí completo:

- **`ConsentRecord`** (dominio): entidad inmutable — el consentimiento no es un booleano, es un hecho con fecha, hora y versión, que es lo que exige poder demostrar la Ley 1581. `studentId` es un identificador opaco que producirá HU-43 cuando exista; este contexto no necesita saber cómo se autenticó, solo qué ID lo identifica.
- **`ConsentPolicy`** (dominio): decide si el consentimiento vigente sigue siendo válido para la versión publicada actual, o si hace falta pedirlo de nuevo (criterio 5) — vigente exige coincidencia exacta de versión, no "alguna vez aceptó".
- **`RecordConsent`** (aplicación): registra una aceptación (criterios 2 y 4 — política de datos y normas del foro se registran de forma independiente, mismo mecanismo, distinto `documentType`).
- **`GetConsentStatus`** (aplicación): evalúa si el estudiante necesita (re)consentir y expone el histórico completo (criterio 6).
- **`ConsentRepositoryPort`** (dominio) + adaptadores en memoria y MongoDB: **append-only por diseño** (`insertOne`, nunca upsert) — cada aceptación se conserva para siempre, nunca se sobreescribe.

Cuando exista HU-43 (autenticación) y una capa HTTP, el flujo de login llamará a `GetConsentStatus` para decidir si mostrar el modal de política (criterio 1), y el adaptador de entrada usará su resultado para bloquear las funciones que tratan datos personales (criterio 3) — la pieza de dominio/aplicación que consumirán ya está lista.

## Estructura

    src/contexts/consent/
      domain/          ConsentRecord, ConsentPolicy, puertos (in/out). No importa infraestructura.
      application/     RecordConsent, GetConsentStatus. Orquestan puertos, no conocen MongoDB.
      infrastructure/  adaptadores en memoria y MongoDB (append-only), reloj.

No está conectado a `src/main.ts` (que es la raíz de composición del scheduler de **ingesta**, un proceso distinto): este contexto no tiene todavía un proceso propio que lo dispare, consistente con que los criterios 1 y 3 están diferidos.

## Criterios de aceptación y dónde se verifican

| Criterio | Estado | Prueba |
|---|---|---|
| 1. Se presenta la política antes de permitir el uso | Diferido | Necesita HU-43 (autenticación) y HTTP |
| 2. La aceptación se registra con fecha, hora y versión | Cubierto | `ConsentUseCases.test.ts`, `MongoConsentRepository.integration.test.ts` |
| 3. Sin aceptar, no se permite el uso de funciones con datos personales | Diferido | Necesita HTTP para bloquear una operación real |
| 4. Política de datos y normas del foro se registran de forma independiente | Cubierto | `ConsentUseCases.test.ts` |
| 5. Una nueva versión publicada exige aceptar de nuevo, sin perder el histórico | Cubierto | `ConsentPolicy.test.ts`, `ConsentUseCases.test.ts` |
| 6. El estudiante puede consultar qué versión aceptó y cuándo | Cubierto | `ConsentUseCases.test.ts`, `MongoConsentRepository.integration.test.ts` |
