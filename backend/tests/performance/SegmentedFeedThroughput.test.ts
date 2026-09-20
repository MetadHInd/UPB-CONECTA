import { MongoClient, type Db } from 'mongodb';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoConsolidatedMessageRegistry } from '../../src/contexts/ingestion/infrastructure/adapters/out/mongo/MongoConsolidatedMessageRegistry.js';
import { MongoProgramTargetingRepository } from '../../src/contexts/targeting/infrastructure/adapters/out/mongo/MongoProgramTargetingRepository.js';

const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
const DATABASE = process.env['MONGODB_TEST_DATABASE'] ?? 'upb_conecta_test';
const DOCS = 20_000;
const BUDGET_MS = 5_000; // Tiempo objetivo para la consulta segmentada

describe('HU-12 criterio 5/6 — consulta segmentada con índice a 20k docs', () => {
  let client: MongoClient;
  let db: Db;
  const CONSOLIDATED = 'perf_segmented_consolidated';
  const TARGETING = 'perf_segmented_program_targeting';

  beforeAll(async () => {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DATABASE);
    await MongoConsolidatedMessageRegistry.ensureIndexes(db, CONSOLIDATED);
    await MongoProgramTargetingRepository.ensureIndexes(db, TARGETING);

    // Populate collections
    const consolidated: any[] = [];
    const targeting: any[] = [];
    const now = Date.now();
    for (let i = 0; i < DOCS; i++) {
      const msgId = `m-${i}`;
      consolidated.push({
        _id: `c-${i}`,
        sender: `s-${i % 50}`,
        subject: `Subject ${i}`,
        body: `Body ${i}`,
        representativeMessageId: msgId,
        firstSentAt: new Date(now - (DOCS - i) * 1000),
        lastSentAt: new Date(now - (DOCS - i) * 500),
        resendCount: 0,
        dueDate: null,
        applicationLink: null
      });

      // Every 5th message targets program P1
      if (i % 5 === 0) {
        targeting.push({ _id: msgId, messageId: msgId, kind: 'programs', programIds: ['P1'], persistedAt: new Date() });
      } else {
        targeting.push({ _id: msgId, messageId: msgId, kind: 'programs', programIds: [`PX-${i % 100}`], persistedAt: new Date() });
      }
    }

    await Promise.all([
      db.collection(CONSOLIDATED).insertMany(consolidated, { ordered: false }),
      db.collection(TARGETING).insertMany(targeting, { ordered: false })
    ]);
  }, 60_000);

  afterAll(async () => {
    await Promise.all([db.collection(CONSOLIDATED).drop().catch(() => undefined), db.collection(TARGETING).drop().catch(() => undefined)]);
    await client.close();
  });

  it(`recupera convocatorias para un programa (P1) en menos de ${BUDGET_MS}ms usando índices`, async () => {
    const start = performance.now();

    // 1) obtener messageIds objetivo desde program_targeting
    const msgCursor = db.collection(TARGETING).find({ programIds: 'P1' }, { projection: { messageId: 1 } });
    const rows = await msgCursor.toArray();
    const messageIds = rows.map((r) => r.messageId);

    // 2) consultar convocatorias por representativeMessageId usando índice
    const docs = await db
      .collection(CONSOLIDATED)
      .find({ representativeMessageId: { $in: messageIds } })
      .sort({ lastSentAt: -1 })
      .limit(100)
      .toArray();

    const elapsed = performance.now() - start;

    expect(docs.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(BUDGET_MS);
  }, 60_000);
});
