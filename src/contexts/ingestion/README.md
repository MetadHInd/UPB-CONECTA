# UPB Conecta, contexto de ingesta

> Documentación específica de este contexto acotado. Para la visión general del proyecto, la arquitectura y cómo levantar todo el entorno (incluyendo MongoDB), ver el [README raíz](../../../README.md).

Implementacion de **HU-01 (SCRUM-13): Conexion programada e idempotente al buzon institucional recolector**.
Trazabilidad: RF-01, RF-02. Caso de uso CU-01, pasos 1, 2 y 5, flujo alternativo A.

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
    npm test                     # 49 pruebas (requiere MongoDB real corriendo, ver README raíz)
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
