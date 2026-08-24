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

## Pruebas unitarias vs. de integración

`tests/domain/`, `tests/application/` y la parte en memoria de `tests/infrastructure/` prueban el dominio y el caso de uso con dobles escritos a mano — rápidas, sin red, sin base de datos. `tests/infrastructure/mongo/*.integration.test.ts` prueban los tres adaptadores de MongoDB **contra una instancia real** (no un mock del driver), porque lo que hay que verificar ahí es justamente que el filtro, el `upsert` y el índice declarado funcionan de verdad contra el motor real. Ver el README raíz para levantar esa instancia.

## Nota sobre el buzon institucional

Mientras la Universidad habilita el buzon recolector (riesgo R-01 del Plan Integrado),
`main.ts` compone el caso de uso con `InMemoryMailboxAdapter` alimentado por un corpus
de mensajes anonimizados. Sustituirlo por `ImapMailboxAdapter` es un cambio de una linea
en la raiz de composicion, sin tocar dominio ni casos de uso.
