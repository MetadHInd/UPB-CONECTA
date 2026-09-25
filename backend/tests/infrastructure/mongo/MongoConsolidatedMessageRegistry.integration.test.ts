import { MongoClient, type Db } from 'mongodb';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { MongoConsolidatedMessageRegistry } from '../../../src/contexts/ingestion/infrastructure/adapters/out/mongo/MongoConsolidatedMessageRegistry.js';
import type { ConsolidatedMessageRecord } from '../../../src/contexts/ingestion/domain/ports/out/ConsolidatedMessageRegistryPort.js';

const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
const DATABASE = process.env['MONGODB_TEST_DATABASE'] ?? 'upb_conecta_test';
const COLLECTION = 'ingestion_consolidated_messages';
const WINDOW_MS = 24 * 60 * 60 * 1000;

function record(overrides: Partial<ConsolidatedMessageRecord> = {}): ConsolidatedMessageRecord {
  return {
    sender: 'idiomas@upb.edu.co',
    subject: 'Convocatoria examen de suficiencia',
    body: 'cuerpo original',
    firstSentAt: new Date('2026-09-10T08:00:00Z'),
    lastSentAt: new Date('2026-09-10T08:00:00Z'),
    resendCount: 0,
    dueDate: { kind: 'sin-vencimiento' },
    applicationLink: null,
    withdrawnAt: null,
    ...overrides
  };
}

/**
 * HU-03: la busqueda por ventana temporal depende del filtro que aplica el
 * adaptador sobre `lastSentAt`, no solo del indice por remitente+asunto. Un
 * mock del driver no ejerceria esa logica sobre documentos reales.
 */
describe('MongoConsolidatedMessageRegistry (integración contra MongoDB real)', () => {
  let client: MongoClient;
  let db: Db;
  let registry: MongoConsolidatedMessageRegistry;

  beforeAll(async () => {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DATABASE);
    await MongoConsolidatedMessageRegistry.ensureIndexes(db);
  });

  beforeEach(async () => {
    await db.collection(COLLECTION).deleteMany({});
    registry = new MongoConsolidatedMessageRegistry(db);
  });

  afterAll(async () => {
    await db.collection(COLLECTION).drop().catch(() => undefined);
    await client.close();
  });

  it('no encuentra grupo cuando no existe ninguno con ese remitente y asunto', async () => {
    const found = await registry.findWithinWindow('a@upb.edu.co', 'x', new Date(), WINDOW_MS);
    expect(found).toBeNull();
  });

  it('guarda un grupo nuevo y lo encuentra dentro de la ventana', async () => {
    const original = record();
    await registry.save(original);

    const found = await registry.findWithinWindow(
      original.sender,
      original.subject,
      new Date('2026-09-10T20:00:00Z'), // +12h
      WINDOW_MS
    );

    expect(found).not.toBeNull();
    expect(found?.resendCount).toBe(0);
  });

  it('criterio 3: no encuentra el grupo cuando la referencia cae fuera de la ventana', async () => {
    await registry.save(record());

    const found = await registry.findWithinWindow(
      'idiomas@upb.edu.co',
      'Convocatoria examen de suficiencia',
      new Date('2026-09-12T08:00:01Z'), // +2 dias y 1s
      WINDOW_MS
    );

    expect(found).toBeNull();
  });

  it('actualiza el mismo documento (upsert) en vez de crear uno nuevo al consolidar', async () => {
    const original = record();
    await registry.save(original);
    await registry.save({ ...original, lastSentAt: new Date('2026-09-10T12:00:00Z'), resendCount: 1 });

    const count = await db.collection(COLLECTION).countDocuments({
      sender: original.sender,
      subject: original.subject
    });
    expect(count).toBe(1);

    const found = await registry.findWithinWindow(
      original.sender,
      original.subject,
      new Date('2026-09-10T12:00:00Z'),
      WINDOW_MS
    );
    expect(found?.resendCount).toBe(1);
    expect(found?.firstSentAt).toEqual(original.firstSentAt);
  });

  it('mantiene grupos distintos para el mismo asunto cuando estan fuera de ventana entre si', async () => {
    await registry.save(record());
    await registry.save(record({ firstSentAt: new Date('2026-10-10T08:00:00Z'), lastSentAt: new Date('2026-10-10T08:00:00Z') }));

    const count = await db.collection(COLLECTION).countDocuments({
      sender: 'idiomas@upb.edu.co',
      subject: 'Convocatoria examen de suficiencia'
    });
    expect(count).toBe(2);
  });

  it('HU-15: findById recupera el grupo por identidad estable, sin depender de la ventana', async () => {
    const original = record();
    await registry.save(original);

    const found = await registry.findById({
      sender: original.sender,
      subject: original.subject,
      firstSentAt: original.firstSentAt
    });

    expect(found?.body).toBe(original.body);
  });

  it('HU-50: guarda y recupera withdrawnAt, y un documento anterior a HU-50 sin el campo se lee como vigente', async () => {
    const original = record();
    await registry.save(original);
    await registry.save({ ...original, withdrawnAt: new Date('2026-09-23T00:00:00Z') });

    const found = await registry.findById({ sender: original.sender, subject: original.subject, firstSentAt: original.firstSentAt });
    expect(found?.withdrawnAt).toEqual(new Date('2026-09-23T00:00:00Z'));

    // Documento sin el campo `withdrawnAt`, simulando un registro anterior a HU-50.
    await db.collection(COLLECTION).updateOne({ sender: original.sender, subject: original.subject }, { $unset: { withdrawnAt: '' } });
    const historic = await registry.findById({ sender: original.sender, subject: original.subject, firstSentAt: original.firstSentAt });
    expect(historic?.withdrawnAt).toBeNull();
  });

  it('findById devuelve null para una identidad que no existe', async () => {
    const found = await registry.findById({
      sender: 'nadie@upb.edu.co',
      subject: 'no existe',
      firstSentAt: new Date('2026-01-01T00:00:00Z')
    });
    expect(found).toBeNull();
  });

  it('crea el indice por remitente y asunto declarado por el adaptador', async () => {
    const indexes = await db.collection(COLLECTION).indexes();
    expect(indexes.some((index) => index.name === 'idx_sender_subject')).toBe(true);
  });
});
