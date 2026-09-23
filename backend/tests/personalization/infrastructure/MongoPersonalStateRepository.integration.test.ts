import { MongoClient, type Db } from 'mongodb';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { MongoPersonalStateRepository } from '../../../src/contexts/personalization/infrastructure/adapters/out/mongo/MongoPersonalStateRepository.js';

const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
const DATABASE = process.env['MONGODB_TEST_DATABASE'] ?? 'upb_conecta_test';
const COLLECTION = 'personalization_states';

describe('MongoPersonalStateRepository (integración contra MongoDB real)', () => {
  let client: MongoClient;
  let db: Db;
  let repository: MongoPersonalStateRepository;

  beforeAll(async () => {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DATABASE);
    await MongoPersonalStateRepository.ensureIndexes(db);
  });

  beforeEach(async () => {
    await db.collection(COLLECTION).deleteMany({});
    repository = new MongoPersonalStateRepository(db);
  });

  afterAll(async () => {
    await db.collection(COLLECTION).drop().catch(() => undefined);
    await client.close();
  });

  it('una convocatoria nunca marcada no tiene documento', async () => {
    expect(await repository.findByStudentAndConvocatoria('est-1', 'conv-1')).toBeNull();
  });

  it('guarda y recupera el estado personal', async () => {
    await repository.save({
      studentId: 'est-1',
      convocatoriaId: 'conv-1',
      read: true,
      saved: true,
      archived: false,
      updatedAt: new Date('2026-01-01T10:00:00Z')
    });

    const found = await repository.findByStudentAndConvocatoria('est-1', 'conv-1');
    expect(found?.read).toBe(true);
    expect(found?.saved).toBe(true);
  });

  it('upsert: guardar dos veces actualiza el mismo documento, no lo duplica', async () => {
    await repository.save({
      studentId: 'est-1',
      convocatoriaId: 'conv-1',
      read: false,
      saved: false,
      archived: false,
      updatedAt: new Date('2026-01-01T10:00:00Z')
    });
    await repository.save({
      studentId: 'est-1',
      convocatoriaId: 'conv-1',
      read: true,
      saved: false,
      archived: false,
      updatedAt: new Date('2026-01-02T10:00:00Z')
    });

    const count = await db.collection(COLLECTION).countDocuments({});
    expect(count).toBe(1);
    const found = await repository.findByStudentAndConvocatoria('est-1', 'conv-1');
    expect(found?.read).toBe(true);
  });

  it('criterio 2: findSavedByStudent devuelve solo las guardadas de ese estudiante', async () => {
    await repository.save({ studentId: 'est-1', convocatoriaId: 'conv-1', read: false, saved: true, archived: false, updatedAt: new Date() });
    await repository.save({ studentId: 'est-1', convocatoriaId: 'conv-2', read: false, saved: false, archived: false, updatedAt: new Date() });
    await repository.save({ studentId: 'est-2', convocatoriaId: 'conv-1', read: false, saved: true, archived: false, updatedAt: new Date() });

    const guardadas = await repository.findSavedByStudent('est-1');
    expect(guardadas.map((s) => s.convocatoriaId)).toEqual(['conv-1']);
  });

  it('criterio 3: findArchivedByStudent recupera las archivadas de ese estudiante', async () => {
    await repository.save({ studentId: 'est-1', convocatoriaId: 'conv-1', read: false, saved: false, archived: true, updatedAt: new Date() });

    const archivadas = await repository.findArchivedByStudent('est-1');
    expect(archivadas).toHaveLength(1);
  });

  it('crea los indices declarados por el adaptador', async () => {
    const indexes = await db.collection(COLLECTION).indexes();
    expect(indexes.some((i) => i.name === 'idx_student_saved')).toBe(true);
    expect(indexes.some((i) => i.name === 'idx_student_archived')).toBe(true);
  });
});
