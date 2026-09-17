import { MongoClient, type Db } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoClassificationRetryQueue } from '../../../src/contexts/classification/infrastructure/adapters/out/mongo/MongoClassificationRetryQueue.js';
import type { InstitutionalMessage } from '../../../src/contexts/ingestion/domain/entities/InstitutionalMessage.js';
import { MessageId } from '../../../src/contexts/ingestion/domain/value-objects/MessageId.js';

const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
const DATABASE = process.env['MONGODB_TEST_DATABASE'] ?? 'upb_conecta_test';
const COLLECTION = 'classification_retry_queue';

describe('MongoClassificationRetryQueue (integración contra MongoDB real)', () => {
  let client: MongoClient;
  let db: Db;
  let queue: MongoClassificationRetryQueue;

  beforeAll(async () => {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DATABASE);
  });

  beforeEach(async () => {
    await db.collection(COLLECTION).deleteMany({});
    queue = new MongoClassificationRetryQueue(db);
  });

  afterAll(async () => {
    await db.collection(COLLECTION).drop().catch(() => undefined);
    await client.close();
  });

  it('guarda las entradas de reintento en Mongo usando el messageId como identificador', async () => {
    const collection = db.collection<{
      _id: string;
      messageId: string;
      message: InstitutionalMessage;
      error: string;
      createdAt: Date;
    }>(COLLECTION);

    const message: InstitutionalMessage = {
      messageId: MessageId.fromHeader('<msg-123@upb.edu.co>'),
      mailboxUid: 42,
      sender: 'sistemas@upb.edu.co',
      subject: 'Convocatoria de pasantías',
      sentAt: new Date('2026-09-12T08:00:00Z'),
      recipients: ['estudiantes@upb.edu.co'],
      body: 'La convocatoria se cierra pronto.',
      attachments: []
    };

    await queue.save({
      messageId: 'msg-123',
      message,
      error: 'timeout del proveedor',
      createdAt: new Date('2026-09-12T08:01:00Z')
    });

    const saved = await collection.findOne({ _id: 'msg-123' });
    expect(saved).toMatchObject({
      _id: 'msg-123',
      messageId: 'msg-123',
      error: 'timeout del proveedor'
    });
    expect(saved?.message).toEqual(message);
  });
});
