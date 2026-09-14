import { MongoClient, type Db } from 'mongodb';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { MongoDeviceRegistry } from '../../../src/contexts/notifications/infrastructure/adapters/out/mongo/MongoDeviceRegistry.js';

const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
const DATABASE = process.env['MONGODB_TEST_DATABASE'] ?? 'upb_conecta_test';
const COLLECTION = 'notification_devices';

/**
 * HU-18: un mock del driver no ejerceria que `register()` haga upsert real
 * por `_id` (criterio 1: sin duplicar) ni que `rotateToken` mueva el
 * documento de un `_id` a otro sobre datos persistidos de verdad.
 */
describe('MongoDeviceRegistry (integración contra MongoDB real)', () => {
  let client: MongoClient;
  let db: Db;
  let registry: MongoDeviceRegistry;

  beforeAll(async () => {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DATABASE);
    await MongoDeviceRegistry.ensureIndexes(db);
  });

  beforeEach(async () => {
    await db.collection(COLLECTION).deleteMany({});
    registry = new MongoDeviceRegistry(db);
  });

  afterAll(async () => {
    await db.collection(COLLECTION).drop().catch(() => undefined);
    await client.close();
  });

  it('un token nunca registrado no figura en el registro', async () => {
    expect(await registry.findByToken('token-a')).toBeNull();
  });

  it('criterio 1: registrar el mismo token dos veces no lo duplica', async () => {
    await registry.register('est-1', 'token-a', new Date('2026-01-01T10:00:00Z'));
    await registry.register('est-1', 'token-a', new Date('2026-01-01T11:00:00Z'));

    const count = await db.collection<{ _id: string }>(COLLECTION).countDocuments({ _id: 'token-a' });
    expect(count).toBe(1);
    const found = await registry.findByToken('token-a');
    expect(found?.registeredAt).toEqual(new Date('2026-01-01T10:00:00Z')); // conserva el registro original
    expect(found?.updatedAt).toEqual(new Date('2026-01-01T11:00:00Z'));
  });

  it('criterio 2: rotar el token mueve el registro a un _id nuevo sin duplicar', async () => {
    await registry.register('est-1', 'token-viejo', new Date('2026-01-01T10:00:00Z'));
    await registry.rotateToken('token-viejo', 'token-nuevo', new Date('2026-01-02T10:00:00Z'));

    expect(await registry.findByToken('token-viejo')).toBeNull();
    const nuevo = await registry.findByToken('token-nuevo');
    expect(nuevo?.studentId).toBe('est-1');
    expect(await db.collection(COLLECTION).countDocuments({})).toBe(1);
  });

  it('criterio 3/5: invalidar un dispositivo lo excluye de los vigentes del estudiante', async () => {
    await registry.register('est-1', 'token-a', new Date('2026-01-01T10:00:00Z'));
    await registry.invalidate('token-a', 'logout', new Date('2026-01-01T11:00:00Z'));

    const activos = await registry.findActiveForStudent('est-1');
    expect(activos).toHaveLength(0);
    const found = await registry.findByToken('token-a');
    expect(found?.status).toBe('invalidated');
    expect(found?.invalidatedReason).toBe('logout');
  });

  it('criterio 4: findActiveForStudent devuelve solo los dispositivos vigentes de ese estudiante', async () => {
    await registry.register('est-1', 'token-a', new Date('2026-01-01T10:00:00Z'));
    await registry.register('est-1', 'token-b', new Date('2026-01-01T10:00:00Z'));
    await registry.register('est-2', 'token-c', new Date('2026-01-01T10:00:00Z'));
    await registry.invalidate('token-b', 'delivery-failed', new Date('2026-01-02T10:00:00Z'));

    const activos = await registry.findActiveForStudent('est-1');
    expect(activos.map((d) => d.deviceToken)).toEqual(['token-a']);
  });

  it('crea el indice declarado por el adaptador', async () => {
    const indexes = await db.collection(COLLECTION).indexes();
    expect(indexes.some((index) => index.name === 'idx_student_status')).toBe(true);
  });
});
