import { MongoClient, type Db } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoClassificationCorrectionRepository } from '../../../src/contexts/classification/infrastructure/adapters/out/mongo/MongoClassificationCorrectionRepository.js';
import { MessageCategory } from '../../../src/contexts/classification/domain/value-objects/MessageCategory.js';

const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
const DATABASE = process.env['MONGODB_TEST_DATABASE'] ?? 'upb_conecta_test';
const COLLECTION = 'classification_corrections_test';

describe('MongoClassificationCorrectionRepository (integración contra MongoDB real)', () => {
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

  it('HU-11, criterio 5: es append-only — dos correcciones del mismo documento quedan como dos entradas del historico', async () => {
    const repository = new MongoClassificationCorrectionRepository(db, COLLECTION);

    await repository.save({
      messageId: 'm1',
      proposedCategory: MessageCategory.BOLETIN_INFORMATIVO,
      previousFinalCategory: MessageCategory.BOLETIN_INFORMATIVO,
      correctedCategory: MessageCategory.EVENTO,
      correctedAt: new Date('2026-09-01T00:00:00Z')
    });
    await repository.save({
      messageId: 'm1',
      proposedCategory: MessageCategory.BOLETIN_INFORMATIVO,
      previousFinalCategory: MessageCategory.EVENTO,
      correctedCategory: MessageCategory.PRACTICA,
      correctedAt: new Date('2026-09-02T00:00:00Z')
    });

    const all = await repository.findAll();

    expect(all).toHaveLength(2);
    expect(all.map((entry) => entry.correctedCategory)).toEqual([MessageCategory.EVENTO, MessageCategory.PRACTICA]);
  });

  it('ensureIndexes no falla sobre una coleccion vacia o ya indexada', async () => {
    await MongoClassificationCorrectionRepository.ensureIndexes(db, COLLECTION);
    await MongoClassificationCorrectionRepository.ensureIndexes(db, COLLECTION);

    const indexes = await db.collection(COLLECTION).indexes();
    expect(indexes.some((index) => index.name === 'idx_message_corrected')).toBe(true);
  });
});
