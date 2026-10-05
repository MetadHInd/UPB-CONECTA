import { MongoClient, type Db } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { programTargeting } from '../../../src/contexts/targeting/domain/value-objects/ProgramTargeting.js';
import { semesterRange } from '../../../src/contexts/targeting/domain/value-objects/SemesterRange.js';
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

  it('HU-37: guarda y recupera el filtro de semestre junto a la segmentación de programa', async () => {
    const record = {
      messageId: 'msg-electivas',
      targeting: programTargeting(['sistemas']),
      semesterRange: semesterRange(6),
      persistedAt: new Date('2026-09-22T12:00:00Z')
    };

    await repository.save(record);

    expect(await repository.findByMessageId('msg-electivas')).toEqual(record);
    expect(await db.collection(COLLECTION).findOne({ _id: 'msg-electivas' as never })).toMatchObject({
      semesterRange: { min: 6, max: null }
    });
  });

  it('HU-37: un registro sin filtro de semestre se lee sin restricción', async () => {
    await repository.save({ messageId: 'msg-sin-rango', targeting: programTargeting(['sistemas']), persistedAt: new Date() });

    const found = await repository.findByMessageId('msg-sin-rango');

    expect(found?.semesterRange ?? null).toBeNull();
  });
});
