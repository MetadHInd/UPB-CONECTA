import { MongoClient, type Db } from 'mongodb';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { MongoNotificationPreferencesRepository } from '../../../src/contexts/notifications/infrastructure/adapters/out/mongo/MongoNotificationPreferencesRepository.js';

const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
const DATABASE = process.env['MONGODB_TEST_DATABASE'] ?? 'upb_conecta_test';
const COLLECTION = 'notification_preferences';

describe('MongoNotificationPreferencesRepository (integración contra MongoDB real)', () => {
  let client: MongoClient;
  let db: Db;
  let repository: MongoNotificationPreferencesRepository;

  beforeAll(async () => {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DATABASE);
  });

  beforeEach(async () => {
    await db.collection(COLLECTION).deleteMany({});
    repository = new MongoNotificationPreferencesRepository(db);
  });

  afterAll(async () => {
    await db.collection(COLLECTION).drop().catch(() => undefined);
    await client.close();
  });

  it('un estudiante sin preferencias guardadas no tiene documento', async () => {
    expect(await repository.findByStudent('est-1')).toBeNull();
  });

  it('guarda y recupera las preferencias de un estudiante', async () => {
    await repository.save({
      studentId: 'est-1',
      categoryPreferences: { becas: false },
      leadTimeMinutes: 180,
      theme: 'dark',
      updatedAt: new Date('2026-01-01T10:00:00Z')
    });

    const found = await repository.findByStudent('est-1');
    expect(found).toEqual({
      studentId: 'est-1',
      categoryPreferences: { becas: false },
      leadTimeMinutes: 180,
      theme: 'dark',
      updatedAt: new Date('2026-01-01T10:00:00Z')
    });
  });

  it('upsert: guardar dos veces actualiza el mismo documento, no lo duplica', async () => {
    await repository.save({
      studentId: 'est-1',
      categoryPreferences: {},
      leadTimeMinutes: 1440,
      theme: 'light',
      updatedAt: new Date('2026-01-01T10:00:00Z')
    });
    await repository.save({
      studentId: 'est-1',
      categoryPreferences: { becas: false },
      leadTimeMinutes: 60,
      theme: 'dark',
      updatedAt: new Date('2026-01-02T10:00:00Z')
    });

    const count = await db.collection(COLLECTION).countDocuments({});
    expect(count).toBe(1);
    const found = await repository.findByStudent('est-1');
    expect(found?.leadTimeMinutes).toBe(60);
    expect(found?.theme).toBe('dark');
  });
});
