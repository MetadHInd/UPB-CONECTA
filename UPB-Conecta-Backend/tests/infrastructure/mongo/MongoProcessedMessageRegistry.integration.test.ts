import { MongoClient, type Db } from 'mongodb';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { MongoProcessedMessageRegistry } from '../../../src/contexts/ingestion/infrastructure/adapters/out/mongo/MongoProcessedMessageRegistry.js';
import { MessageId } from '../../../src/contexts/ingestion/domain/value-objects/MessageId.js';

const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
const DATABASE = process.env['MONGODB_TEST_DATABASE'] ?? 'upb_conecta_test';
const COLLECTION = 'ingestion_processed_messages';

interface ProcessedMessageDocument {
  _id: string;
  mailboxUid: number;
  processedAt: Date;
}

/**
 * RF-02, criterio 3: la idempotencia sobre reejecuciones tiene que sobrevivir
 * a un motor de persistencia real. Un mock del driver de MongoDB no ejerce el
 * indice `idx_mailbox_uid` ni el `$setOnInsert` que evita que un segundo
 * `markAsProcessed` sobre el mismo Message-ID pise el `processedAt` original.
 */
describe('MongoProcessedMessageRegistry (integración contra MongoDB real)', () => {
  let client: MongoClient;
  let db: Db;
  let registry: MongoProcessedMessageRegistry;

  beforeAll(async () => {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DATABASE);
    await MongoProcessedMessageRegistry.ensureIndexes(db);
  });

  beforeEach(async () => {
    await db.collection(COLLECTION).deleteMany({});
    registry = new MongoProcessedMessageRegistry(db);
  });

  afterAll(async () => {
    // Solo se limpia la propia coleccion: los tres archivos de integración
    // comparten la base "upb_conecta_test" y Vitest los corre en paralelo, de
    // modo que un dropDatabase() aqui podria borrar las colecciones de los
    // otros archivos mientras sus pruebas todavia estan corriendo.
    await db.collection(COLLECTION).drop().catch(() => undefined);
    await client.close();
  });

  it('un mensaje nunca marcado no figura como procesado', async () => {
    const id = MessageId.fromHeader('<a@upb.edu.co>');
    expect(await registry.hasBeenProcessed(id)).toBe(false);
  });

  it('marca un mensaje como procesado y lo reporta en consultas posteriores', async () => {
    const id = MessageId.fromHeader('<a@upb.edu.co>');
    await registry.markAsProcessed(id, 101, new Date('2026-08-24T10:00:00Z'));
    expect(await registry.hasBeenProcessed(id)).toBe(true);
  });

  it('marcar el mismo mensaje dos veces no falla y no duplica el documento', async () => {
    const id = MessageId.fromHeader('<a@upb.edu.co>');
    await registry.markAsProcessed(id, 101, new Date('2026-08-24T10:00:00Z'));
    await registry.markAsProcessed(id, 101, new Date('2026-08-24T10:05:00Z'));

    const count = await db.collection<ProcessedMessageDocument>(COLLECTION).countDocuments({ _id: id.toString() });
    expect(count).toBe(1);
  });

  it('$setOnInsert conserva el processedAt original ante una segunda escritura', async () => {
    const id = MessageId.fromHeader('<a@upb.edu.co>');
    const primeraVez = new Date('2026-08-24T10:00:00Z');
    await registry.markAsProcessed(id, 101, primeraVez);
    await registry.markAsProcessed(id, 101, new Date('2026-08-24T10:05:00Z'));

    const stored = await db.collection<ProcessedMessageDocument>(COLLECTION).findOne({ _id: id.toString() });
    expect(stored?.processedAt).toEqual(primeraVez);
  });

  it('distingue mensajes con distinto Message-ID aunque compartan mailboxUid de lote', async () => {
    const a = MessageId.fromHeader('<a@upb.edu.co>');
    const b = MessageId.fromHeader('<b@upb.edu.co>');
    await registry.markAsProcessed(a, 101, new Date('2026-08-24T10:00:00Z'));

    expect(await registry.hasBeenProcessed(a)).toBe(true);
    expect(await registry.hasBeenProcessed(b)).toBe(false);
  });

  it('crea el indice sobre mailboxUid declarado por el adaptador', async () => {
    const indexes = await db.collection(COLLECTION).indexes();
    expect(indexes.some((index) => index.name === 'idx_mailbox_uid')).toBe(true);
  });
});
