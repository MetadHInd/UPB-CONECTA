import { MongoClient, type Db } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { programTargeting } from '../../../src/contexts/targeting/domain/value-objects/ProgramTargeting.js';
import { MongoProgramTargetingRepository } from '../../../src/contexts/targeting/infrastructure/adapters/out/mongo/MongoProgramTargetingRepository.js';

const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
const DATABASE = process.env['MONGODB_TEST_DATABASE'] ?? 'upb_conecta_test';
const COLLECTION = 'program_targeting';

describe('MongoProgramTargetingRepository (integración contra MongoDB real)', () => {
  let client: MongoClient;
  let db: Db;
  let repository: MongoProgramTargetingRepository;

  beforeAll(async () => {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DATABASE);
  });

  beforeEach(async () => {
    await db.collection(COLLECTION).deleteMany({});
    repository = new MongoProgramTargetingRepository(db);
  });

  afterAll(async () => {
    await db.collection(COLLECTION).drop().catch(() => undefined);
    await client.close();
  });

  it('guarda y consulta exactamente la misma segmentación calculada por el dominio', async () => {
    const targeting = programTargeting(['sistemas', 'industrial']);

    await repository.save({
      messageId: 'msg-targeting-123',
      targeting,
      persistedAt: new Date('2026-09-13T12:00:00Z')
    });

    const found = await repository.findByMessageId('msg-targeting-123');

    expect(found).toEqual({
      messageId: 'msg-targeting-123',
      targeting,
      persistedAt: new Date('2026-09-13T12:00:00Z')
    });
  });
});
