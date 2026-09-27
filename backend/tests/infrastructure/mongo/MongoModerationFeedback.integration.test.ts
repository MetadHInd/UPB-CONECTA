import { MongoClient, type Db } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { HandleModerationDecision } from '../../../src/contexts/moderation/application/HandleModerationDecision.js';
import { MongoContentModerationLog } from '../../../src/contexts/moderation/infrastructure/adapters/out/mongo/MongoContentModerationLog.js';
import { MongoModerationNoticeOutbox } from '../../../src/contexts/moderation/infrastructure/adapters/out/mongo/MongoModerationNoticeOutbox.js';
import { MongoRetainedContentQueue } from '../../../src/contexts/moderation/infrastructure/adapters/out/mongo/MongoRetainedContentQueue.js';
import type { RetainedContentReview } from '../../../src/contexts/moderation/domain/entities/RetainedContentReview.js';
import { FixedClock } from '../../../src/contexts/ingestion/infrastructure/adapters/out/memory/SystemClock.js';
import { blockDecision, HOUR_MS, NOW, retainDecision, TEST_CONFIG } from '../../moderation/feedbackHarness.js';

const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
const DATABASE = process.env['MONGODB_TEST_DATABASE'] ?? 'upb_conecta_test';
const QUEUE = 'moderation_retained_content_test';
const LOG = 'moderation_content_decisions_test';
const NOTICES = 'moderation_notices_test';

function review(overrides: Partial<RetainedContentReview> = {}): RetainedContentReview {
  return {
    contentId: 'post-1',
    contentKind: 'post',
    authorEmail: 'ana@upb.edu.co',
    category: 'harassment',
    fragment: 'fragmento',
    retainedAt: NOW,
    resolutionDeadline: new Date(NOW.getTime() + 24 * HOUR_MS),
    status: 'pending',
    resolvedAt: null,
    resolvedBy: null,
    escalatedAt: null,
    ...overrides
  };
}

describe('Soporte Mongo de HU-32 (integración contra MongoDB real)', () => {
  let client: MongoClient;
  let db: Db;

  beforeAll(async () => {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DATABASE);
  });

  beforeEach(async () => {
    for (const name of [QUEUE, LOG, NOTICES]) await db.collection(name).deleteMany({});
  });

  afterAll(async () => {
    for (const name of [QUEUE, LOG, NOTICES]) await db.collection(name).drop().catch(() => undefined);
    await client.close();
  });

  it('la cola guarda una revision por contenido y la recupera intacta', async () => {
    await MongoRetainedContentQueue.ensureIndexes(db, QUEUE);
    const queue = new MongoRetainedContentQueue(db, QUEUE);

    await queue.save(review());
    await queue.save(review({ status: 'approved', resolvedAt: NOW, resolvedBy: 'admin@upb.edu.co' }));

    expect(await db.collection(QUEUE).countDocuments()).toBe(1);
    expect(await queue.findByContentId('post-1')).toEqual(review({ status: 'approved', resolvedAt: NOW, resolvedBy: 'admin@upb.edu.co' }));
    expect(await queue.findByContentId('nada')).toBeNull();
  });

  it('findPending ordena por plazo y excluye lo resuelto; findOverdueNotEscalated respeta el limite y el escalado', async () => {
    const queue = new MongoRetainedContentQueue(db, QUEUE);
    const at = (hours: number) => new Date(NOW.getTime() + hours * HOUR_MS);
    await queue.save(review({ contentId: 'tarde', resolutionDeadline: at(20) }));
    await queue.save(review({ contentId: 'pronto', resolutionDeadline: at(2) }));
    await queue.save(review({ contentId: 'hecho', resolutionDeadline: at(1), status: 'approved', resolvedAt: NOW, resolvedBy: 'a' }));
    await queue.save(review({ contentId: 'ya-escalado', resolutionDeadline: at(1), escalatedAt: NOW }));

    expect((await queue.findPending()).map((r) => r.contentId)).toEqual(['ya-escalado', 'pronto', 'tarde']);
    expect((await queue.findOverdueNotEscalated(at(2))).map((r) => r.contentId)).toEqual([]);
    expect((await queue.findOverdueNotEscalated(new Date(at(2).getTime() + 1))).map((r) => r.contentId)).toEqual(['pronto']);
  });

  it('el registro es append-only y conserva fragmento, categoria y detalle interno', async () => {
    await MongoContentModerationLog.ensureIndexes(db, LOG);
    const log = new MongoContentModerationLog(db, LOG);
    const entry = {
      contentId: 'post-1',
      contentKind: 'post' as const,
      authorEmail: 'ana@upb.edu.co',
      verdict: 'block' as const,
      category: 'harassment',
      fragment: 'fragmento',
      decidedBy: 'auto-moderation',
      source: 'automatic' as const,
      internalDetail: { score: 0.9 },
      occurredAt: NOW
    };

    await log.record(entry);
    await log.record({ ...entry, verdict: 'publish', source: 'human-review', internalDetail: null, occurredAt: new Date(NOW.getTime() + 1) });

    const found = await log.findByContentId('post-1');
    expect(found).toHaveLength(2);
    expect(found[0]).toEqual(entry);
    expect(found[1]?.verdict).toBe('publish');
    expect(await log.findByContentId('otro')).toEqual([]);
  });

  it('la bandeja deja los avisos pendientes de entrega y el aviso al autor no lleva detalle interno', async () => {
    await MongoModerationNoticeOutbox.ensureIndexes(db, NOTICES);
    const outbox = new MongoModerationNoticeOutbox(db, NOTICES);
    const queue = new MongoRetainedContentQueue(db, QUEUE);
    const log = new MongoContentModerationLog(db, LOG);
    const handle = new HandleModerationDecision({ config: TEST_CONFIG, queue, log, notifications: outbox, clock: new FixedClock(NOW) });

    await handle.execute(retainDecision({ internalDetail: { score: 0.8734, model: 'toxicity-model-v9' } }));
    await handle.execute(blockDecision({ contentId: 'post-2', internalDetail: { score: 0.8734, model: 'toxicity-model-v9' } }));
    await outbox.alertOverdueReview(review(), NOW);

    const docs = await db.collection(NOTICES).find({}).toArray();
    expect(docs.map((d) => [d['recipient'], d['type'], d['deliveredAt']])).toEqual([
      ['ana@upb.edu.co', 'author-feedback', null],
      ['ana@upb.edu.co', 'author-feedback', null],
      ['content-admins', 'overdue-review', null]
    ]);
    const authorNotices = JSON.stringify(docs.filter((d) => d['type'] === 'author-feedback'));
    expect(authorNotices).not.toContain('0.8734');
    expect(authorNotices).not.toContain('toxicity-model-v9');
    // ...pero el registro de auditoria si conserva el detalle
    expect((await log.findByContentId('post-2'))[0]?.internalDetail).toEqual({ score: 0.8734, model: 'toxicity-model-v9' });
  });
});
