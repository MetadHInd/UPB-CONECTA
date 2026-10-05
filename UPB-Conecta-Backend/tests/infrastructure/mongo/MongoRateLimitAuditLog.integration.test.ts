import { MongoClient, type Db } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoRateLimitAuditLog } from '../../../src/contexts/hardening/infrastructure/adapters/out/mongo/MongoRateLimitAuditLog.js';

const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
const DATABASE = process.env['MONGODB_TEST_DATABASE'] ?? 'upb_conecta_test';
const COLLECTION = 'rate_limit_audit_test';

describe('MongoRateLimitAuditLog (integración contra MongoDB real)', () => {
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

  it('HU-47, criterio 6: es append-only — dos excesos del mismo sujeto quedan como dos entradas', async () => {
    const auditLog = new MongoRateLimitAuditLog(db, COLLECTION);

    await auditLog.record({
      operation: 'CreatePost',
      subject: 'ana@upb.edu.co',
      origin: '10.0.0.1',
      limit: 5,
      windowMs: 60_000,
      occurredAt: new Date('2026-09-23T12:00:00Z')
    });
    await auditLog.record({
      operation: 'CreatePost',
      subject: 'ana@upb.edu.co',
      origin: '10.0.0.1',
      limit: 5,
      windowMs: 60_000,
      occurredAt: new Date('2026-09-23T12:00:05Z')
    });

    expect(await db.collection(COLLECTION).countDocuments()).toBe(2);
  });

  it('ensureIndexes no falla sobre una coleccion vacia o ya indexada', async () => {
    await MongoRateLimitAuditLog.ensureIndexes(db, COLLECTION);
    await MongoRateLimitAuditLog.ensureIndexes(db, COLLECTION);

    const indexes = await db.collection(COLLECTION).indexes();
    expect(indexes.some((index) => index.name === 'idx_subject_occurred')).toBe(true);
  });
});
