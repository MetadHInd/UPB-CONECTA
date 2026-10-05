import { MongoClient, type Db } from 'mongodb';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { MongoDueDateConvocatoriaSource } from '../../../src/contexts/notifications/infrastructure/adapters/out/mongo/MongoDueDateConvocatoriaSource.js';
import { MongoConsolidatedMessageRegistry } from '../../../src/contexts/ingestion/infrastructure/adapters/out/mongo/MongoConsolidatedMessageRegistry.js';
import { convocatoriaIdToString } from '../../../src/contexts/ingestion/domain/value-objects/ConvocatoriaId.js';
import type { ConsolidatedMessageRecord } from '../../../src/contexts/ingestion/domain/ports/out/ConsolidatedMessageRegistryPort.js';

const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
const DATABASE = process.env['MONGODB_TEST_DATABASE'] ?? 'upb_conecta_test';
// Coleccion propia (no `ingestion_consolidated_messages`) para no interferir
// con `MongoConsolidatedMessageRegistry.integration.test.ts`, que trunca esa
// misma coleccion en su `beforeEach` y puede correr en paralelo.
const COLLECTION = 'ingestion_consolidated_messages_notifications_test';

function record(overrides: Partial<ConsolidatedMessageRecord> = {}): ConsolidatedMessageRecord {
  return {
    sender: 'oficina@upb.edu.co',
    subject: 'Convocatoria de beca',
    body: 'texto',
    representativeMessageId: 'msg-1',
    firstSentAt: new Date('2026-01-01T00:00:00Z'),
    lastSentAt: new Date('2026-01-01T00:00:00Z'),
    resendCount: 0,
    dueDate: { kind: 'sin-vencimiento' },
    applicationLink: null,
    withdrawnAt: null,
    ...overrides
  };
}

describe('MongoDueDateConvocatoriaSource (HU-19, integración contra MongoDB real)', () => {
  let client: MongoClient;
  let db: Db;
  let writer: MongoConsolidatedMessageRegistry;
  let source: MongoDueDateConvocatoriaSource;

  beforeAll(async () => {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DATABASE);
  });

  beforeEach(async () => {
    await db.collection(COLLECTION).deleteMany({});
    writer = new MongoConsolidatedMessageRegistry(db, COLLECTION);
    source = new MongoDueDateConvocatoriaSource(db, COLLECTION);
  });

  afterAll(async () => {
    await db.collection(COLLECTION).drop().catch(() => undefined);
    await client.close();
  });

  it('solo devuelve convocatorias con fecha de cierre concreta (con-fecha)', async () => {
    await writer.save(record({ subject: 'sin fecha', representativeMessageId: 'm-sin-fecha', dueDate: { kind: 'sin-vencimiento' } }));
    await writer.save(
      record({
        subject: 'con fecha',
        representativeMessageId: 'm-con-fecha',
        dueDate: { kind: 'con-fecha', date: new Date('2026-02-01T00:00:00Z') }
      })
    );

    const candidates = await source.findWithDueDate();

    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.representativeMessageId).toBe('m-con-fecha');
    expect(candidates[0]!.dueAt).toEqual(new Date('2026-02-01T00:00:00Z'));
  });

  it('expone el estado de retiro (withdrawn) leido de la misma coleccion que ingestion', async () => {
    await writer.save(
      record({
        subject: 'retirada',
        representativeMessageId: 'm-retirada',
        dueDate: { kind: 'con-fecha', date: new Date('2026-02-01T00:00:00Z') },
        withdrawnAt: new Date('2026-01-15T00:00:00Z')
      })
    );

    const [candidate] = await source.findWithDueDate();
    expect(candidate!.withdrawn).toBe(true);
  });

  it('el convocatoriaId coincide con el que produce `convocatoriaIdToString` sobre el mismo registro', async () => {
    const r = record({ dueDate: { kind: 'con-fecha', date: new Date('2026-02-01T00:00:00Z') } });
    await writer.save(r);

    const [candidate] = await source.findWithDueDate();
    expect(candidate!.convocatoriaId).toBe(convocatoriaIdToString({ sender: r.sender, subject: r.subject, firstSentAt: r.firstSentAt }));
  });
});
