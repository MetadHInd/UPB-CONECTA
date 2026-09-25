import { MongoClient, type Db } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoConvocatoriaAuditLog } from '../../../src/contexts/ingestion/infrastructure/adapters/out/mongo/MongoConvocatoriaAuditLog.js';
import { ConvocatoriaAuditEventKind } from '../../../src/contexts/ingestion/domain/ports/out/ConvocatoriaAuditLogPort.js';

const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
const DATABASE = process.env['MONGODB_TEST_DATABASE'] ?? 'upb_conecta_test';
const COLLECTION = 'convocatoria_audit_test';

describe('MongoConvocatoriaAuditLog (integración contra MongoDB real)', () => {
  let client: MongoClient;
  let db: Db;

  beforeAll(async () => {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DATABASE);
  });

  beforeEach(async () => {
    await db.collection(COLLECTION).deleteMany({});
  });

  afterAll(async () => {
    await db.collection(COLLECTION).drop().catch(() => undefined);
    await client.close();
  });

  it('HU-50, criterio 6: es append-only — publicar y luego retirar la misma convocatoria deja dos entradas', async () => {
    const auditLog = new MongoConvocatoriaAuditLog(db, COLLECTION);

    await auditLog.record({
      kind: ConvocatoriaAuditEventKind.PUBLISHED,
      convocatoriaId: 'c1',
      messageId: 'm1',
      actor: 'admin@upb.edu.co',
      occurredAt: new Date('2026-09-23T00:00:00Z')
    });
    await auditLog.record({
      kind: ConvocatoriaAuditEventKind.WITHDRAWN,
      convocatoriaId: 'c1',
      messageId: 'm1',
      actor: 'admin@upb.edu.co',
      occurredAt: new Date('2026-09-24T00:00:00Z')
    });

    const count = await db.collection(COLLECTION).countDocuments();
    expect(count).toBe(2);
  });

  it('ensureIndexes no falla sobre una coleccion vacia o ya indexada', async () => {
    await MongoConvocatoriaAuditLog.ensureIndexes(db, COLLECTION);
    await MongoConvocatoriaAuditLog.ensureIndexes(db, COLLECTION);

    const indexes = await db.collection(COLLECTION).indexes();
    expect(indexes.some((index) => index.name === 'idx_convocatoria_occurred')).toBe(true);
  });
});
