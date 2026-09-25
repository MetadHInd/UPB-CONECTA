import { MongoClient, type Db } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoModerationAuditLog } from '../../../src/contexts/moderation/infrastructure/adapters/out/mongo/MongoModerationAuditLog.js';
import { ModerationAction } from '../../../src/contexts/moderation/domain/ports/out/ModerationAuditLogPort.js';
import { MongoQuarantineRepository } from '../../../src/contexts/ingestion/infrastructure/adapters/out/mongo/MongoQuarantineRepository.js';
import { MongoConsolidatedMessageRegistry } from '../../../src/contexts/ingestion/infrastructure/adapters/out/mongo/MongoConsolidatedMessageRegistry.js';

const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
const DATABASE = process.env['MONGODB_TEST_DATABASE'] ?? 'upb_conecta_test';
const AUDIT_COLLECTION = 'moderation_review_decisions_test';
const QUARANTINE_COLLECTION = 'ingestion_quarantined_messages_test';
const CONSOLIDATED_COLLECTION = 'ingestion_consolidated_messages_test';

describe('Soporte Mongo de HU-49 (integración contra MongoDB real)', () => {
  let client: MongoClient;
  let db: Db;

  beforeAll(async () => {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DATABASE);
  });

  beforeEach(async () => {
    await db.collection(AUDIT_COLLECTION).deleteMany({});
    await db.collection(QUARANTINE_COLLECTION).deleteMany({});
    await db.collection(CONSOLIDATED_COLLECTION).deleteMany({});
  });

  afterAll(async () => {
    await db.collection(AUDIT_COLLECTION).drop().catch(() => undefined);
    await db.collection(QUARANTINE_COLLECTION).drop().catch(() => undefined);
    await db.collection(CONSOLIDATED_COLLECTION).drop().catch(() => undefined);
    await client.close();
  });

  it('MongoModerationAuditLog es append-only', async () => {
    const auditLog = new MongoModerationAuditLog(db, AUDIT_COLLECTION);

    await auditLog.record({
      subject: 'admin@upb.edu.co',
      action: ModerationAction.DISCARD,
      ref: { kind: 'quarantine', mailboxUid: 1 },
      reason: 'motivo',
      occurredAt: new Date('2026-09-23T00:00:00Z')
    });
    await auditLog.record({
      subject: 'admin@upb.edu.co',
      action: ModerationAction.PUBLISH,
      ref: { kind: 'pending-review', messageId: 'm1' },
      reason: null,
      occurredAt: new Date('2026-09-23T00:01:00Z')
    });

    expect(await db.collection(AUDIT_COLLECTION).countDocuments()).toBe(2);
    const all = await auditLog.findAll();
    expect(all).toHaveLength(2);
    expect(all.map((d) => d.action)).toEqual([ModerationAction.DISCARD, ModerationAction.PUBLISH]);
  });

  it('MongoQuarantineRepository.findAll lista todo lo persistido', async () => {
    const repository = new MongoQuarantineRepository(db, QUARANTINE_COLLECTION);
    await repository.save({ mailboxUid: 1, cause: 'sin Message-ID', rawSource: 'raw1', quarantinedAt: new Date('2026-09-23T00:00:00Z') });
    await repository.save({ mailboxUid: 2, cause: 'MIME invalido', rawSource: 'raw2', quarantinedAt: new Date('2026-09-23T00:01:00Z') });

    const all = await repository.findAll();
    expect(all).toHaveLength(2);
    expect(all.map((m) => m.mailboxUid).sort()).toEqual([1, 2]);
  });

  it('MongoConsolidatedMessageRegistry.findByRepresentativeMessageId resuelve el grupo por messageId', async () => {
    const registry = new MongoConsolidatedMessageRegistry(db, CONSOLIDATED_COLLECTION);
    await MongoConsolidatedMessageRegistry.ensureIndexes(db, CONSOLIDATED_COLLECTION);
    await registry.save({
      sender: 's@upb.edu.co',
      subject: 'Convocatoria',
      body: 'cuerpo',
      representativeMessageId: 'rep-1',
      firstSentAt: new Date('2026-09-01T00:00:00Z'),
      lastSentAt: new Date('2026-09-01T00:00:00Z'),
      resendCount: 0,
      dueDate: { kind: 'sin-vencimiento' },
      applicationLink: null,
      withdrawnAt: null
    });

    const found = await registry.findByRepresentativeMessageId('rep-1');
    expect(found?.sender).toBe('s@upb.edu.co');
    expect(await registry.findByRepresentativeMessageId('no-existe')).toBeNull();
  });
});
