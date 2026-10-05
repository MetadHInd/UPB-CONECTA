import { MongoClient, type Db } from 'mongodb';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { MongoIngestionCursorRepository } from '../../../src/contexts/ingestion/infrastructure/adapters/out/mongo/MongoIngestionCursorRepository.js';
import { IngestionCursor } from '../../../src/contexts/ingestion/domain/value-objects/IngestionCursor.js';

const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
const DATABASE = process.env['MONGODB_TEST_DATABASE'] ?? 'upb_conecta_test';
const COLLECTION = 'ingestion_cursors';

interface CursorDocument {
  _id: string;
  lastConfirmedUid: number;
  lastConfirmedAt: Date | null;
}

/**
 * Contra MongoDB real, no un mock del driver: un doble del cliente de
 * MongoDB podria devolver lo que el test le pida sin validar que el filtro
 * `_id`, el `$set` y el `upsert: true` realmente producen un unico documento
 * reutilizable en cada ciclo de ingesta.
 */
describe('MongoIngestionCursorRepository (integración contra MongoDB real)', () => {
  let client: MongoClient;
  let db: Db;
  let repository: MongoIngestionCursorRepository;

  beforeAll(async () => {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DATABASE);
  });

  beforeEach(async () => {
    await db.collection(COLLECTION).deleteMany({});
    repository = new MongoIngestionCursorRepository(db);
  });

  afterAll(async () => {
    // Solo se limpia la propia coleccion: los tres archivos de integración
    // comparten la base "upb_conecta_test" y Vitest los corre en paralelo, de
    // modo que un dropDatabase() aqui podria borrar las colecciones de los
    // otros archivos mientras sus pruebas todavia estan corriendo.
    await db.collection(COLLECTION).drop().catch(() => undefined);
    await client.close();
  });

  it('devuelve el cursor inicial cuando no hay ningun documento persistido', async () => {
    const cursor = await repository.load();
    expect(cursor.lastConfirmedUid).toBe(0);
    expect(cursor.lastConfirmedAt).toBeNull();
  });

  it('persiste y restaura el punto de lectura confirmado', async () => {
    const at = new Date('2026-08-24T10:00:00Z');
    await repository.save(IngestionCursor.initial().advanceTo(105, at));

    const restored = await repository.load();
    expect(restored.lastConfirmedUid).toBe(105);
    expect(restored.lastConfirmedAt).toEqual(at);
  });

  it('hace upsert: guardar dos veces actualiza el mismo documento, no crea otro', async () => {
    await repository.save(IngestionCursor.initial().advanceTo(101, new Date('2026-08-24T10:00:00Z')));
    await repository.save(IngestionCursor.initial().advanceTo(105, new Date('2026-08-24T10:05:00Z')));

    const documents = await db.collection<CursorDocument>(COLLECTION).find({}).toArray();
    expect(documents).toHaveLength(1);
    expect(documents[0]?.lastConfirmedUid).toBe(105);

    const restored = await repository.load();
    expect(restored.lastConfirmedUid).toBe(105);
  });
});
