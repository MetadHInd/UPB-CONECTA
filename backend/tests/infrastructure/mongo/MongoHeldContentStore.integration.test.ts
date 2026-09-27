import { MongoClient, type Db } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ModerationReason } from '../../../src/contexts/moderation/domain/services/ModerationDecisionPolicy.js';
import { MongoHeldContentStore } from '../../../src/contexts/moderation/infrastructure/adapters/out/mongo/MongoHeldContentStore.js';

const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
const DATABASE = process.env['MONGODB_TEST_DATABASE'] ?? 'upb_conecta_test';
const COLLECTION = 'moderation_held_content_test';

const item = (id: string, minutes: number, score: number | null = 0.6) => ({
  id,
  kind: 'post' as const,
  topicId: 'general',
  title: 'Título',
  text: 'Texto',
  author: { email: 'ana@upb.edu.co', name: 'Ana Gómez', programName: 'Ingeniería de Sistemas', programId: 'sistemas' },
  reason: ModerationReason.BETWEEN_THRESHOLDS,
  score,
  retainedAt: new Date(Date.UTC(2026, 8, 22, 12, minutes))
});

describe('HU-31 criterio 4 — MongoHeldContentStore (MongoDB real)', () => {
  let client: MongoClient;
  let db: Db;
  let queue: MongoHeldContentStore;

  beforeAll(async () => {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DATABASE);
    await MongoHeldContentStore.ensureIndexes(db, COLLECTION);
    queue = new MongoHeldContentStore(db, COLLECTION);
  });

  beforeEach(async () => {
    await db.collection(COLLECTION).deleteMany({});
  });

  afterAll(async () => {
    await db.collection(COLLECTION).drop().catch(() => undefined);
    await client.close();
  });

  it('guarda la copia completa y la devuelve, más antiguo primero', async () => {
    await queue.enqueue(item('b', 5));
    await queue.enqueue(item('a', 1, null));

    const pending = await queue.findPending();

    expect(pending.map((i) => i.id)).toEqual(['a', 'b']);
    expect(pending[0]).toEqual(item('a', 1, null));
  });

  it('encolar el mismo id dos veces no duplica ni pisa el original', async () => {
    await queue.enqueue(item('a', 1, 0.5));
    await queue.enqueue(item('a', 9, 0.7));

    const pending = await queue.findPending();

    expect(pending).toHaveLength(1);
    expect(pending[0]?.score).toBe(0.5);
  });

  it('busca por id y devuelve null si no existe', async () => {
    await queue.enqueue(item('a', 1));

    expect(await queue.findById('a')).toEqual(item('a', 1));
    expect(await queue.findById('zzz')).toBeNull();
  });

  it('retira la copia y retirar dos veces no falla', async () => {
    await queue.enqueue(item('a', 1));

    await queue.remove('a');
    await queue.remove('a');

    expect(await queue.findById('a')).toBeNull();
  });
});
