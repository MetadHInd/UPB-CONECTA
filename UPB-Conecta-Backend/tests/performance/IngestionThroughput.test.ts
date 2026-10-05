import { MongoClient, type Db } from 'mongodb';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { IngestInstitutionalMessages } from '../../src/contexts/ingestion/application/IngestInstitutionalMessages.js';
import { IdempotencyPolicy } from '../../src/contexts/ingestion/domain/services/IdempotencyPolicy.js';
import { DeduplicationPolicy } from '../../src/contexts/ingestion/domain/services/DeduplicationPolicy.js';
import { QuarantineIncidentPolicy } from '../../src/contexts/ingestion/domain/services/QuarantineIncidentPolicy.js';
import { MongoProcessedMessageRegistry } from '../../src/contexts/ingestion/infrastructure/adapters/out/mongo/MongoProcessedMessageRegistry.js';
import { MongoConsolidatedMessageRegistry } from '../../src/contexts/ingestion/infrastructure/adapters/out/mongo/MongoConsolidatedMessageRegistry.js';
import { MongoQuarantineRepository } from '../../src/contexts/ingestion/infrastructure/adapters/out/mongo/MongoQuarantineRepository.js';
import { MongoIngestionCursorRepository } from '../../src/contexts/ingestion/infrastructure/adapters/out/mongo/MongoIngestionCursorRepository.js';
import { MongoIngestionRunLogRepository } from '../../src/contexts/ingestion/infrastructure/adapters/out/mongo/MongoIngestionRunLogRepository.js';
import { InMemoryMailboxAdapter } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryMailboxAdapter.js';
import { SystemClock } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/SystemClock.js';
import { MimeMessageNormalizerAdapter } from '../../src/contexts/ingestion/infrastructure/adapters/out/normalization/MimeMessageNormalizerAdapter.js';
import { SpanishDueDateExtractor } from '../../src/contexts/ingestion/infrastructure/extraction/SpanishDueDateExtractor.js';
import { buildSyntheticMessages } from '../../src/contexts/ingestion/infrastructure/fixtures/syntheticMessages.js';

const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
const DATABASE = process.env['MONGODB_TEST_DATABASE'] ?? 'upb_conecta_test';
const BATCH_SIZE = 200;
const BUDGET_MS = 5 * 60 * 1000; // criterio 3: menos de 5 minutos

/**
 * HU-55, criterio 3 — CUBIERTO PARCIALMENTE: el criterio dice "se ingiere,
 * normaliza y clasifica en menos de 5 minutos", pero la clasificacion
 * (HU-06 en adelante) todavia no existe en el codigo. Esta prueba mide lo
 * que si existe hoy del pipeline: ingesta + idempotencia (HU-01) +
 * normalizacion (HU-02) + deduplicacion (HU-03) + cuarentena (HU-04) +
 * extraccion de fecha/enlace (HU-08), contra MongoDB real (no mocks) para
 * que el tiempo medido incluya el costo real de E/S — el cuello de botella
 * mas realista en produccion, dado que no hay buzon IMAP real todavia.
 */
describe('HU-55 criterio 3 (parcial) — rendimiento de un lote de 200 mensajes', () => {
  let client: MongoClient;
  let db: Db;

  // Nombres de coleccion exclusivos de este archivo: los tests de integracion
  // de mongo/ comparten la base "upb_conecta_test" y Vitest los corre en
  // paralelo, asi que reusar sus colecciones (o hacerles drop en afterAll)
  // les borraria datos mientras todavia estan corriendo.
  const PROCESSED = 'perf_ingestion_processed_messages';
  const CONSOLIDATED = 'perf_ingestion_consolidated_messages';
  const QUARANTINE = 'perf_ingestion_quarantined_messages';
  const CURSOR = 'perf_ingestion_cursor';
  const RUN_LOGS = 'perf_ingestion_run_logs';

  beforeAll(async () => {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DATABASE);
    await MongoProcessedMessageRegistry.ensureIndexes(db, PROCESSED);
    await MongoConsolidatedMessageRegistry.ensureIndexes(db, CONSOLIDATED);
    await MongoIngestionRunLogRepository.ensureIndexes(db, RUN_LOGS);
  });

  afterAll(async () => {
    await Promise.all(
      [PROCESSED, CONSOLIDATED, QUARANTINE, CURSOR, RUN_LOGS].map((name) =>
        db.collection(name).drop().catch(() => undefined)
      )
    );
    await client.close();
  });

  it(`ingiere, normaliza, deduplica y extrae metadatos de ${BATCH_SIZE} mensajes en menos de 5 minutos`, async () => {
    const registry = new MongoProcessedMessageRegistry(db, PROCESSED);
    const consolidatedRegistry = new MongoConsolidatedMessageRegistry(db, CONSOLIDATED);
    const quarantine = new MongoQuarantineRepository(db, QUARANTINE);
    const messages = buildSyntheticMessages(BATCH_SIZE);
    const mailbox = new InMemoryMailboxAdapter(messages);

    const useCase = new IngestInstitutionalMessages({
      mailbox,
      registry,
      consolidatedRegistry,
      quarantine,
      cursors: new MongoIngestionCursorRepository(db, CURSOR),
      logs: new MongoIngestionRunLogRepository(db, RUN_LOGS),
      idempotency: new IdempotencyPolicy(registry),
      deduplication: new DeduplicationPolicy(consolidatedRegistry),
      deduplicationWindowMs: 30 * 24 * 60 * 60 * 1000,
      quarantineIncidentPolicy: new QuarantineIncidentPolicy(1),
      normalizer: new MimeMessageNormalizerAdapter(),
      dueDateExtractor: new SpanishDueDateExtractor(),
      clock: new SystemClock(),
      batchSize: BATCH_SIZE
    });

    const startedAt = performance.now();
    const log = await useCase.execute();
    const elapsedMs = performance.now() - startedAt;

    expect(log.read).toBe(BATCH_SIZE);
    expect(log.processed).toBe(BATCH_SIZE);
    expect(elapsedMs).toBeLessThan(BUDGET_MS);
  }, BUDGET_MS + 30_000);
});
