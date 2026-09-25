import { MongoClient, type Db } from 'mongodb';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { MongoEmittedReminderRegistry } from '../../../src/contexts/notifications/infrastructure/adapters/out/mongo/MongoEmittedReminderRegistry.js';

const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
const DATABASE = process.env['MONGODB_TEST_DATABASE'] ?? 'upb_conecta_test';
const COLLECTION = 'notifications_emitted_reminders';

describe('MongoEmittedReminderRegistry (HU-19, integración contra MongoDB real)', () => {
  let client: MongoClient;
  let db: Db;
  let registry: MongoEmittedReminderRegistry;

  beforeAll(async () => {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DATABASE);
    await MongoEmittedReminderRegistry.ensureIndexes(db, COLLECTION);
  });

  beforeEach(async () => {
    await db.collection(COLLECTION).deleteMany({});
    registry = new MongoEmittedReminderRegistry(db, COLLECTION);
  });

  afterAll(async () => {
    await db.collection(COLLECTION).drop().catch(() => undefined);
    await client.close();
  });

  it('un aviso nunca marcado no figura como emitido', async () => {
    expect(await registry.wasEmitted('est-1', 'convocatoria-1', 1440, 1000)).toBe(false);
  });

  it('marca un aviso como emitido y lo reporta en consultas siguientes', async () => {
    await registry.markEmitted('est-1', 'convocatoria-1', 1440, 1000, new Date('2026-01-01T00:00:00Z'));
    expect(await registry.wasEmitted('est-1', 'convocatoria-1', 1440, 1000)).toBe(true);
  });

  it('la clave incluye el cierre vigente: un cierre distinto se trata como un aviso nunca emitido (criterio 3)', async () => {
    await registry.markEmitted('est-1', 'convocatoria-1', 1440, 1000, new Date('2026-01-01T00:00:00Z'));
    expect(await registry.wasEmitted('est-1', 'convocatoria-1', 1440, 2000)).toBe(false);
  });

  it('marcar el mismo aviso dos veces no falla (idempotente)', async () => {
    await registry.markEmitted('est-1', 'convocatoria-1', 1440, 1000, new Date('2026-01-01T00:00:00Z'));
    await expect(registry.markEmitted('est-1', 'convocatoria-1', 1440, 1000, new Date('2026-01-02T00:00:00Z'))).resolves.toBeUndefined();
  });
});
