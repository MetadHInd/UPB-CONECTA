import { MongoClient, type Db } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMessageFailureRepository } from '../../../src/contexts/ingestion/infrastructure/adapters/out/mongo/MongoMessageFailureRepository.js';

const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
const DATABASE = process.env['MONGODB_TEST_DATABASE'] ?? 'upb_conecta_test';
const COLLECTION = 'ingestion_message_failures_test';
const T0 = new Date('2026-09-22T12:00:00Z');
const T1 = new Date('2026-09-22T12:05:00Z');

describe('MongoMessageFailureRepository (integración contra MongoDB real)', () => {
  let client: MongoClient;
  let db: Db;
  let repository: MongoMessageFailureRepository;

  beforeAll(async () => {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DATABASE);
  });

  beforeEach(async () => {
    await db.collection(COLLECTION).deleteMany({});
    repository = new MongoMessageFailureRepository(db, COLLECTION);
  });

  afterAll(async () => {
    await db.collection(COLLECTION).drop().catch(() => undefined);
    await client.close();
  });

  it('acumula los fallos por uid y conserva el primero y el último', async () => {
    expect(await repository.recordFailure(42, 'fallo 1', T0)).toBe(1);
    expect(await repository.recordFailure(42, 'fallo 2', T1)).toBe(2);
    expect(await repository.recordFailure(7, 'otro', T1)).toBe(1);

    expect(await db.collection(COLLECTION).findOne({ _id: 42 as never })).toEqual({
      _id: 42,
      attempts: 2,
      lastCause: 'fallo 2',
      firstFailedAt: T0,
      lastFailedAt: T1
    });
  });

  it('el incremento es atómico: diez fallos concurrentes cuentan diez', async () => {
    const totals = await Promise.all(Array.from({ length: 10 }, () => repository.recordFailure(99, 'x', T0)));

    expect([...totals].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
