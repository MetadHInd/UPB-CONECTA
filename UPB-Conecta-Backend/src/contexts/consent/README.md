# UPB Conecta, contexto de consentimiento

> Documentación específica de este contexto acotado. Para la visión general del proyecto y la arquitectura, ver el [README raíz](../../../README.md).

Implementación de **HU-44 (SCRUM-56): Consentimiento informado de tratamiento de datos con registro versionado** — completa, seis de seis criterios. Trazabilidad: RF-71, RNF-23, Ley Estatutaria 1581 de 2012.

Primer contexto del backend fuera de `ingestion`, siguiendo el mismo patrón hexagonal (`domain/application/infrastructure`).

## Alcance

La historia exige que en el primer ingreso el sistema **presente** la política y las normas del foro (criterio 1) y **bloquee** el uso de funciones que tratan datos personales si el estudiante no acepta, explicando la razón (criterio 3). El README original de esta historia declaraba ambos criterios diferidos porque "requieren HU-43 (autenticación) y un punto de entrada HTTP que disparen ese flujo — ninguno existe todavía". Eso dejó de ser cierto: HU-43 (autenticación), HU-45 (sesión) y HU-46 (control de acceso por rol) ya están en `main`, y **no hay servidor HTTP en este repositorio, y eso no bloquea la historia** — mismo patrón que esas tres historias declaran explícitamente en `src/contexts/identity/README.md`: el diseño asigna a un futuro adaptador HTTP la traducción de encabezados/códigos de estado, y aquí (y en `identity`) se entrega completo todo lo que esa capa consumirá.

Lo que se implementa aquí, completo:

- **`ConsentRecord`** (dominio): entidad inmutable — el consentimiento no es un booleano, es un hecho con fecha, hora y versión, que es lo que exige poder demostrar la Ley 1581. `studentId` es un identificador opaco; en la práctica lo produce `identity` (el correo institucional, mismo sujeto que usa la sesión de HU-45), pero este contexto no necesita saber cómo se autenticó, solo qué ID lo identifica.
- **`ConsentPolicy`** (dominio): decide si el consentimiento vigente sigue siendo válido para la versión publicada actual, o si hace falta pedirlo de nuevo (criterio 5) — vigente exige coincidencia exacta de versión, no "alguna vez aceptó".
- **`RecordConsent`** (aplicación): registra una aceptación (criterios 2 y 4 — política de datos y normas del foro se registran de forma independiente, mismo mecanismo, distinto `documentType`).
- **`GetConsentStatus`** (aplicación): evalúa si el estudiante necesita (re)consentir y expone el histórico completo (criterio 6).
- **`ConsentRepositoryPort`** (dominio) + adaptadores en memoria y MongoDB: **append-only por diseño** (`insertOne`, nunca upsert) — cada aceptación se conserva para siempre, nunca se sobreescribe.
- **`explainConsentRequirement`** (dominio, servicio puro): traduce el motivo técnico (`nunca-acepto` / `version-desactualizada`) al texto que verá el estudiante — el criterio 3 exige literalmente "explica la razón", así que el mecanismo de bloqueo nunca devuelve un booleano mudo.
- **`PublishedConsentVersionsPort`** (dominio) + `loadPublishedConsentVersions` (infraestructura, `config/consent-document-versions.json`): qué versión de cada documento está publicada **hoy**. Mismo patrón que `ProtectedOperationsCatalogPort` de HU-46 — dato de configuración externo, no una constante en código, porque publicar una versión nueva es una decisión editorial.
- **`RequireConsentToProceed`** (aplicación, criterio 3): el punto de enganche — dado un estudiante y la lista de documentos que exige una operación, decide si puede continuar o no, y si no puede, por qué. Reutiliza `GetConsentStatus` en vez de reevaluar la vigencia por su cuenta.
- **`ConsentRequiredOperationsCatalogPort`** (dominio) + `loadConsentRequiredOperationsCatalog` (infraestructura, `config/consent-required-operations.json`): catálogo declarativo de qué documentos exige cada operación que trata datos personales — ver [Criterio 3](#criterio-3--bloqueo-por-falta-de-consentimiento-vigente) más abajo.

El punto de enganche de **criterio 1** vive en `identity`, no aquí: `AuthenticateStudent` (HU-43) gana una dependencia `consentStatus: ConsentStatusPort` que invoca tras autenticar, exactamente igual a como ya invoca `profileSync` (HU-37) y `sessions` (HU-45). Ese puerto lo implementa `ConsentStatusAdapter` en la infraestructura de `identity`, que llama a `RequireConsentToProceed` de este contexto. Detalle completo en `src/contexts/identity/README.md`, sección HU-44.

## Criterio 3 — bloqueo por falta de consentimiento vigente

Se estudió primero `AuthorizeOperation` (HU-46, control de acceso por rol) como referencia, con dos opciones: (a) extender ese mismo catálogo/mecanismo con una dimensión adicional de "consentimiento vigente", o (b) un caso de uso paralelo. Se eligió **(b), `RequireConsentToProceed`, separado de `AuthorizeOperation`**, por una razón de fondo, no solo de conveniencia: son dos obligaciones legalmente distintas. `AuthorizeOperation` responde "¿esta cuenta tiene el rol que exige esta operación?" (control de acceso interno, RF-76); `RequireConsentToProceed` responde "¿este estudiante autorizó el tratamiento de sus datos personales?" (Ley 1581 de 2012, RF-71). Mezclarlas en un solo catálogo obligaría a que un rechazo por falta de consentimiento se auditara de forma idéntica a un rechazo por rol insuficiente, y a que cambiar una política de roles pudiera tocar sin querer la política de consentimiento. Mantenerlas separadas cuesta un segundo catálogo (`config/consent-required-operations.json`, mismo formato que `config/protected-operations.json`) a cambio de que cada mecanismo pueda evolucionar — y auditarse — sin que el otro se entere.

`config/consent-required-operations.json` declara, por operación, qué documentos exige: hoy registra `ViewStudentProfile` y `UpdateStudentProfile` (perfil, HU-04) y `CreatePost` (foro, HU-30) como ejemplo representativo de operaciones que tratan datos personales del estudiante — mismo alcance que HU-46 entregó para su propio catálogo ("el mecanismo, no la migración completa"): no se instrumentó cada caso de uso existente para invocar `RequireConsentToProceed`, porque hacerlo es un cambio mecánico pero amplio, contexto por contexto, ajeno al mecanismo en sí. Agregar una operación nueva es una línea en el JSON.

`RequireConsentToProceed.execute({ studentId, documentTypes })` recorre cada documento exigido, pide su vigencia a `GetConsentStatus` (con la versión publicada actual desde `PublishedConsentVersionsPort`) y, si alguno falta o quedó desactualizado, devuelve `{ allowed: false, reason, pending }` — `reason` es la explicación combinada lista para mostrar, `pending` el detalle documento por documento con su propio motivo y texto (`explainConsentRequirement`). Si el catálogo de versiones publicadas no declara un documento que la operación exige, falla explícito (`MissingPublishedConsentVersionError`) en vez de tratarlo como "sin restricción" — mismo principio que `UnknownProtectedOperationError` de HU-46.

## Estructura

    src/contexts/consent/
      domain/          ConsentRecord, ConsentPolicy, explainConsentRequirement, puertos (in/out). No importa infraestructura.
      application/     RecordConsent, GetConsentStatus, RequireConsentToProceed. Orquestan puertos, no conocen MongoDB.
      infrastructure/  adaptadores en memoria y MongoDB (append-only), reloj, catálogos JSON (versiones publicadas, operaciones que exigen consentimiento).

No está conectado a `src/main.ts` (que es la raíz de composición del scheduler de **ingesta**, un proceso distinto): este contexto no tiene todavía un proceso propio que lo dispare — mismo estado que `identity`, que tampoco lo está. Eso no impide entregar completos el dominio y la aplicación que un futuro adaptador HTTP consumirá; ver `src/contexts/identity/README.md` para el razonamiento completo.

## Criterios de aceptación y dónde se verifican

| Criterio | Estado | Prueba |
|---|---|---|
| 1. Se presenta la política antes de permitir el uso | Cubierto | `ConsentAtLogin.test.ts` (en `identity`; el resultado del login trae `consent.mustConsent`/`pending`), `ConsentStatusAdapter.test.ts` |
| 2. La aceptación se registra con fecha, hora y versión | Cubierto | `ConsentUseCases.test.ts`, `MongoConsentRepository.integration.test.ts` |
| 3. Sin aceptar, no se permite el uso de funciones con datos personales, y se explica la razón | Cubierto | `RequireConsentToProceed.test.ts`, `explainConsentRequirement.test.ts`, `JsonConsentRequiredOperationsCatalog.test.ts` |
| 4. Política de datos y normas del foro se registran de forma independiente | Cubierto | `ConsentUseCases.test.ts` |
| 5. Una nueva versión publicada exige aceptar de nuevo, sin perder el histórico | Cubierto | `ConsentPolicy.test.ts`, `ConsentUseCases.test.ts`, `RequireConsentToProceed.test.ts`, `ConsentAtLogin.test.ts` |
| 6. El estudiante puede consultar qué versión aceptó y cuándo | Cubierto | `ConsentUseCases.test.ts`, `MongoConsentRepository.integration.test.ts` |
