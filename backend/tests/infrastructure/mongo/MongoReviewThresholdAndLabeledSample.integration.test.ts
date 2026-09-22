import { MongoClient, type Db } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ReviewThreshold } from '../../../src/contexts/classification/domain/value-objects/ReviewThreshold.js';
import { MessageCategory } from '../../../src/contexts/classification/domain/value-objects/MessageCategory.js';
import { MongoReviewThresholdConfig } from '../../../src/contexts/classification/infrastructure/adapters/out/mongo/MongoReviewThresholdConfig.js';
import { MongoLabeledSampleRepository } from '../../../src/contexts/classification/infrastructure/adapters/out/mongo/MongoLabeledSampleRepository.js';

const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
const DATABASE = process.env['MONGODB_TEST_DATABASE'] ?? 'upb_conecta_test';
const THRESHOLD_COLLECTION = 'review_threshold_config_test';
const SAMPLE_COLLECTION = 'labeled_samples_test';

describe('MongoReviewThresholdConfig y MongoLabeledSampleRepository (integración contra MongoDB real)', () => {
  let client: MongoClient;
  let db: Db;

  beforeAll(async () => {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DATABASE);
  });

  beforeEach(async () => {
    await db.collection(THRESHOLD_COLLECTION).deleteMany({});
    await db.collection(SAMPLE_COLLECTION).deleteMany({});
  });

  afterAll(async () => {
    await db.collection(THRESHOLD_COLLECTION).drop().catch(() => undefined);
    await db.collection(SAMPLE_COLLECTION).drop().catch(() => undefined);
    await client.close();
  });

  it('sin configuracion guardada devuelve el umbral por defecto', async () => {
    const config = new MongoReviewThresholdConfig(db, THRESHOLD_COLLECTION);

    expect((await config.get()).value).toBe(ReviewThreshold.default().value);
  });

  it('criterio 4: un umbral guardado lo lee otra instancia del adaptador (sin redespliegue) y un segundo set lo reemplaza', async () => {
    await new MongoReviewThresholdConfig(db, THRESHOLD_COLLECTION).set(ReviewThreshold.of(0.75));
    const reader = new MongoReviewThresholdConfig(db, THRESHOLD_COLLECTION);
    expect((await reader.get()).value).toBe(0.75);

    await reader.set(ReviewThreshold.of(0.5));
    expect((await new MongoReviewThresholdConfig(db, THRESHOLD_COLLECTION).get()).value).toBe(0.5);
    expect(await db.collection(THRESHOLD_COLLECTION).countDocuments()).toBe(1);
  });

  it('guarda la muestra etiquetada con upsert por messageId', async () => {
    const repository = new MongoLabeledSampleRepository(db, SAMPLE_COLLECTION);

    await repository.save({ messageId: 'm1', actualCategory: MessageCategory.CONVOCATORIA_CON_PLAZO });
    await repository.save({ messageId: 'm1', actualCategory: MessageCategory.BOLETIN_INFORMATIVO });
    await repository.save({ messageId: 'm2', actualCategory: MessageCategory.EVENTO });

    const all = await repository.findAll();

    expect(all).toHaveLength(2);
    expect(all).toContainEqual({ messageId: 'm1', actualCategory: MessageCategory.BOLETIN_INFORMATIVO });
    expect(all).toContainEqual({ messageId: 'm2', actualCategory: MessageCategory.EVENTO });
  });
});
