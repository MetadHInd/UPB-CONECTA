# UPB Conecta, contexto de ingesta

> Documentación específica de este contexto acotado. Para la visión general del proyecto, la arquitectura y cómo levantar todo el entorno (incluyendo MongoDB), ver el [README raíz](../../../README.md).

Implementacion de **HU-01 (SCRUM-13): Conexion programada e idempotente al buzon institucional recolector**
y **HU-02 (SCRUM-14): Extraccion de metadatos y normalizacion del cuerpo del mensaje**.
Trazabilidad: RF-01, RF-02, RF-03, RF-04. Caso de uso CU-01, pasos 1 a 5, flujo alternativo A.

## Stack

TypeScript sobre Node.js, MongoDB como motor documental, Vitest para pruebas.

## Estructura

    src/contexts/ingestion/
      domain/          value objects, entidades, politicas y puertos. No importa infraestructura.
      application/     el caso de uso. Orquesta puertos, no conoce IMAP ni MongoDB.
      infrastructure/  configuracion, planificador y adaptadores IMAP, MongoDB y en memoria.
    src/main.ts        raiz de composicion, unico punto donde se eligen adaptadores concretos.

## Comandos

    npm install
    npm run typecheck            # TypeScript estricto
    npm run check:architecture   # regla de dependencia (RNF-41)
    npm test                     # 76 pruebas (requiere MongoDB real corriendo, ver README raíz)
    npm run test:coverage        # umbral del 80% sobre dominio y casos de uso

## Criterios de aceptacion y donde se verifican

| Criterio | Prueba |
|---|---|
| 1. El planificador dispara la ingesta sin intervencion humana | `IngestionScheduler.test.ts` |
| 2. La frecuencia cambia sin recompilar ni redesplegar | `IngestionConfig.test.ts`, `IngestionScheduler.test.ts` |
| 3. La reejecucion sobre el mismo lote no genera documentos nuevos | `IngestInstitutionalMessages.test.ts`, `MongoProcessedMessageRegistry.integration.test.ts` |
| 4. La identidad se determina por Message-ID, no por asunto ni fecha | `MessageId.test.ts`, `IdempotencyPolicy.test.ts` |
| 5. Un fallo a mitad de lote conserva el punto de lectura | `IngestInstitutionalMessages.test.ts`, `IngestionCursor.test.ts`, `MongoIngestionCursorRepository.integration.test.ts` |
| RF-07. Bitácora de ingesta consultable | `MongoIngestionRunLogRepository.integration.test.ts` |
| HU-05. Reintento con espera exponencial ante indisponibilidad del buzón y Circuit Breaker | `RetryingMailboxAdapter.test.ts`, `CircuitBreakerMailboxAdapter.test.ts` |

## HU-02 — Extracción de metadatos y normalización del cuerpo (RF-03, RF-04)

Traduce cada `RawInstitutionalMessage` (HU-01, sin normalizar) a un
`InstitutionalMessage`: remitente, asunto, cuerpo en texto plano, fecha de
envío y destinatarios declarados, listo para el clasificador (HU-06 en
adelante). Vive enteramente en infraestructura
(`infrastructure/normalization/MimeMessageNormalizer.ts`) — el dominio no
sabe que existe MIME, HTML ni juegos de caracteres; esa es la frontera ACL
que exige el diseño de la historia (revisión de literatura, sección 5.2).

No se integró en `MailboxIngestionPort` ni en el caso de uso `IngestInstitutionalMessages`:
la idempotencia (HU-01) sólo necesita `messageId` y `mailboxUid`, no el cuerpo normalizado, así
que forzar esa dependencia habría acoplado dos historias sin necesidad. El normalizador queda
listo para que el contexto de clasificación lo consuma cuando exista.

| Criterio | Prueba |
|---|---|
| 1. Extrae remitente, asunto, cuerpo, fecha de envío y destinatarios en `InstitutionalMessage` | `MimeMessageNormalizer.test.ts` — criterio 1 |
| 2. HTML a texto plano legible conservando todas las direcciones web | `MimeMessageNormalizer.test.ts` — criterio 2 |
| 3. Elimina firma institucional, aviso legal y cadena de reenvío | `MimeMessageNormalizer.test.ts` — criterio 3 |
| 4. Codificación no UTF-8 o caracteres acentuados mal codificados se conservan sin corrupción | `MimeMessageNormalizer.test.ts` — criterio 4 |
| 5. Un adjunto no interrumpe el procesamiento y su presencia queda como metadato | `MimeMessageNormalizer.test.ts` — criterio 5 |
| Definición de terminado: ≥ 15 correos institucionales anonimizados (HTML, texto plano, multiparte, reenvío) | `infrastructure/fixtures/institutionalMessageSources.ts` (19 fixtures) |

## HU-53 — Verificación del aislamiento del dominio (RNF-41, RNF-42)

Esta historia exige que el aislamiento del dominio sea demostrable mediante
análisis estático y que sustituir adaptadores no requiera tocar `domain/` ni
`application/`.

Qué existe hoy y cómo se verifica:

- **Análisis estático**: el script `scripts/check-architecture.mjs` verifica
  que `src/contexts/ingestion/domain/` no importe dependencias de
  infraestructura (por ejemplo `mongodb`, `express` o rutas `infrastructure/`).
- **Prueba automatizada**: `tests/infrastructure/check-architecture.test.ts`
  crea un fixture intencional que viola la regla y comprueba que el script
  detecta la violación (lo que hace que la comprobación falle con código de
  salida distinto de cero). Esto satisface la definición de terminado de
  HU-53.

Puertos declarados hoy (criterio 6, parcial)

| Puerto | Implementación real | Doble en memoria |
|---|---:|---:|
| `MailboxIngestionPort` | `src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryMailboxAdapter.ts` | `InMemoryMailboxAdapter` (mismo archivo) |
| `ProcessedMessageRegistryPort` | `src/contexts/ingestion/infrastructure/adapters/out/mongo/MongoProcessedMessageRegistry.ts` | no aplica (se usan dobles en tests) |
| `IngestionCursorRepositoryPort` | `src/contexts/ingestion/infrastructure/adapters/out/mongo/MongoIngestionCursorRepository.ts` | no aplica |
| `IngestionRunLogRepositoryPort` | `src/contexts/ingestion/infrastructure/adapters/out/mongo/MongoIngestionRunLogRepository.ts` | no aplica |

Nota: la historia original lista puertos para clasificación, moderación,
notificaciones, cartografía, identidad y chatbot. Esos contextos/puertos **no
existen** todavía en este repositorio; por tanto no los he declarado ni
implementado aquí. Cuando aparezcan los contextos correspondientes se
documentarán e implementarán adaptadores reales y dobles en memoria siguiendo
el mismo patrón.

Sustituibilidad de adaptadores (criterios 3 y 4)

- Sustituir `MongoProcessedMessageRegistry` por otro motor de persistencia
  (por ejemplo un adaptador distinto) no requiere cambios en `domain/` ni
  `application/` porque el caso de uso y las entidades dependen sólo del
  puerto (`ProcessedMessageRegistryPort`). La regla de dependencia (RNF-41)
  junto con los puertos asegura este desacoplamiento.

Trazabilidad: RNF-41, RNF-42 — ver `scripts/check-architecture.mjs` y
`tests/infrastructure/check-architecture.test.ts`.

## Pruebas unitarias vs. de integración

`tests/domain/`, `tests/application/` y la parte en memoria de `tests/infrastructure/` prueban el dominio y el caso de uso con dobles escritos a mano — rápidas, sin red, sin base de datos. `tests/infrastructure/mongo/*.integration.test.ts` prueban los tres adaptadores de MongoDB **contra una instancia real** (no un mock del driver), porque lo que hay que verificar ahí es justamente que el filtro, el `upsert` y el índice declarado funcionan de verdad contra el motor real. Ver el README raíz para levantar esa instancia.

## Nota sobre el buzon institucional

Mientras la Universidad habilita el buzon recolector (riesgo R-01 del Plan Integrado),
`main.ts` compone el caso de uso con `InMemoryMailboxAdapter` alimentado por un corpus
de mensajes anonimizados. Sustituirlo por `ImapMailboxAdapter` es un cambio de una linea
en la raiz de composicion, sin tocar dominio ni casos de uso.
