import { MongoClient, type Db } from 'mongodb';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { MongoQuarantineRepository } from '../../../src/contexts/ingestion/infrastructure/adapters/out/mongo/MongoQuarantineRepository.js';

const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
const DATABASE = process.env['MONGODB_TEST_DATABASE'] ?? 'upb_conecta_test';
const COLLECTION = 'ingestion_quarantined_messages';

describe('MongoQuarantineRepository (integración contra MongoDB real)', () => {
  let client: MongoClient;
  let db: Db;
  let repository: MongoQuarantineRepository;

  beforeAll(async () => {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DATABASE);
  });

  beforeEach(async () => {
    await db.collection(COLLECTION).deleteMany({});
    repository = new MongoQuarantineRepository(db);
  });

  afterAll(async () => {
    await db.collection(COLLECTION).drop().catch(() => undefined);
    await client.close();
  });

  it('un uid nunca guardado no figura en cuarentena', async () => {
    expect(await repository.findByUid(999)).toBeNull();
  });

  it('guarda un mensaje en cuarentena y lo recupera con su causa y contenido crudo', async () => {
    await repository.save({
      mailboxUid: 101,
      cause: 'invalid message-id',
      rawSource: '<p>cuerpo original</p>',
      quarantinedAt: new Date('2026-09-11T10:00:00Z')
    });

    const found = await repository.findByUid(101);
    expect(found?.cause).toBe('invalid message-id');
    expect(found?.rawSource).toBe('<p>cuerpo original</p>');
    expect(found?.quarantinedAt).toEqual(new Date('2026-09-11T10:00:00Z'));
  });

  it('guardar el mismo uid dos veces actualiza el documento (upsert) en vez de duplicarlo', async () => {
    await repository.save({
      mailboxUid: 101,
      cause: 'invalid message-id',
      rawSource: 'v1',
      quarantinedAt: new Date('2026-09-11T10:00:00Z')
    });
    await repository.save({
      mailboxUid: 101,
      cause: 'invalid message-id (reintento)',
      rawSource: 'v2',
      quarantinedAt: new Date('2026-09-11T11:00:00Z')
    });

    const count = await db.collection<{ _id: number }>(COLLECTION).countDocuments({ _id: 101 });
    expect(count).toBe(1);

    const found = await repository.findByUid(101);
    expect(found?.rawSource).toBe('v2');
  });
});
