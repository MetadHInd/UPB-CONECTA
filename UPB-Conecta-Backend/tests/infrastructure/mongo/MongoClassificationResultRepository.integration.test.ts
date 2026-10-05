import { MongoClient, type Db } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ClassificationResult } from '../../../src/contexts/classification/domain/entities/ClassificationResult.js';
import { MessageCategory } from '../../../src/contexts/classification/domain/value-objects/MessageCategory.js';
import { ConfidenceScore } from '../../../src/contexts/classification/domain/value-objects/ConfidenceScore.js';
import { MongoClassificationResultRepository } from '../../../src/contexts/classification/infrastructure/adapters/out/mongo/MongoClassificationResultRepository.js';

const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
const DATABASE = process.env['MONGODB_TEST_DATABASE'] ?? 'upb_conecta_test';
const COLLECTION = 'classification_results';

describe('MongoClassificationResultRepository (integración contra MongoDB real)', () => {
  let client: MongoClient;
  let db: Db;
  let repository: MongoClassificationResultRepository;

  beforeAll(async () => {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DATABASE);
  });

  beforeEach(async () => {
    await db.collection(COLLECTION).deleteMany({});
    repository = new MongoClassificationResultRepository(db);
  });

  afterAll(async () => {
    await db.collection(COLLECTION).drop().catch(() => undefined);
    await client.close();
  });

  it('hace upsert del resultado de clasificación por messageId y conserva la última versión', async () => {
    const persistedAt = new Date('2026-09-12T08:00:00Z');
    const initial = new ClassificationResult(
      MessageCategory.CONVOCATORIA_CON_PLAZO,
      MessageCategory.CONVOCATORIA_CON_PLAZO,
      false,
      'primera clasificación'
    ).toPersistedRecord('msg-456', persistedAt);

    await repository.save(initial);
    await repository.save({
      ...initial,
      finalCategory: MessageCategory.BECA,
      reason: 'actualización posterior',
      persistedAt: new Date('2026-09-12T08:05:00Z')
    });

    const documents = await db.collection(COLLECTION).find({ messageId: 'msg-456' }).toArray();

    expect(documents).toHaveLength(1);
    expect(documents[0]).toMatchObject({
      messageId: 'msg-456',
      finalCategory: MessageCategory.BECA,
      reason: 'actualización posterior'
    });
  });

  it('HU-10: persiste puntaje y estado de publicacion, y los recupera por messageId y en findAll', async () => {
    const record = ClassificationResult.fromCategory(MessageCategory.CONVOCATORIA_CON_PLAZO, {
      confidenceScore: ConfidenceScore.of(0.35)
    }).toPersistedRecord('msg-hu10', new Date('2026-09-20T10:00:00Z'), 'pending-review');

    await repository.save(record);

    expect(await repository.findByMessageId('msg-hu10')).toEqual(record);
    expect(await repository.findByMessageId('no-existe')).toBeNull();
    expect(await repository.findAll()).toEqual([record]);
  });

  it('HU-10: ensureIndexes crea un indice unico sobre messageId', async () => {
    await MongoClassificationResultRepository.ensureIndexes(db);

    const indexes = await db.collection(COLLECTION).indexes();
    const index = indexes.find((candidate) => candidate.name === 'idx_message_id');

    expect(index?.unique).toBe(true);
  });
});
