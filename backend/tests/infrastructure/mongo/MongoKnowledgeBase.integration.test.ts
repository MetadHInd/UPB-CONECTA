import { MongoClient, type Db } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { KnowledgeAuditEventKind } from '../../../src/contexts/knowledge/domain/ports/out/KnowledgeAuditLogPort.js';
import { MongoKnowledgeAuditLog } from '../../../src/contexts/knowledge/infrastructure/adapters/out/mongo/MongoKnowledgeAuditLog.js';
import { MongoKnowledgeEntryRepository } from '../../../src/contexts/knowledge/infrastructure/adapters/out/mongo/MongoKnowledgeEntryRepository.js';
import { ADMIN, buildKnowledgeHarness, T0, validForm } from '../../knowledge/knowledgeHarness.js';

const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
// Base propia: comparte nombres de coleccion con otras pruebas de integracion que corren en paralelo.
const DATABASE = `${process.env['MONGODB_TEST_DATABASE'] ?? 'upb_conecta_test'}_knowledge`;

describe('Base de conocimiento sobre MongoDB — HU-41 (integración contra MongoDB real)', () => {
  let client: MongoClient;
  let db: Db;

  beforeAll(async () => {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DATABASE);
    await db.dropDatabase();
    await MongoKnowledgeEntryRepository.ensureIndexes(db);
    await MongoKnowledgeAuditLog.ensureIndexes(db);
  });

  afterAll(async () => {
    await db.dropDatabase();
    await client.close();
  });

  it('publica, edita y retira; el chatbot lee de la base sin caché y la auditoría es append-only', async () => {
    const kb = buildKnowledgeHarness({ entries: new MongoKnowledgeEntryRepository(db), auditLog: new MongoKnowledgeAuditLog(db) });

    const published = await kb.publish.execute({ form: validForm(), publishedBy: ADMIN });
    if (!published.ok) throw new Error(published.message);
    const { id } = published.entry;
    expect((await kb.knowledgeBase.search('matrícula')).map((s) => s.id)).toEqual([id]);

    kb.setNow(new Date(T0.getTime() + 3_600_000));
    await kb.edit.execute({ entryId: id, form: { content: 'Contenido nuevo sobre pagos.' }, editedBy: ADMIN });
    const stored = await new MongoKnowledgeEntryRepository(db).findById(id);
    expect(stored).toMatchObject({ version: 2, content: 'Contenido nuevo sobre pagos.' });
    expect(stored?.history).toHaveLength(1);
    expect(stored?.history[0]).toMatchObject({ version: 1, replacedAt: new Date(T0.getTime() + 3_600_000) });

    await kb.withdraw.execute({ entryId: id, withdrawnBy: ADMIN });
    expect(await kb.knowledgeBase.search('matrícula')).toEqual([]);
    expect(await kb.knowledgeBase.findById(id)).toBeNull();
    expect(await db.collection('knowledge_entries').countDocuments({ _id: id as never })).toBe(1);
    expect((await kb.list.execute({ status: 'withdrawn' })).map((e) => e.id)).toEqual([id]);

    const history = await kb.history.execute({ entryId: id });
    if (!history.ok) throw new Error(history.message);
    expect(history.audit.map((event) => event.kind)).toEqual([KnowledgeAuditEventKind.CREATED, KnowledgeAuditEventKind.EDITED, KnowledgeAuditEventKind.WITHDRAWN]);
    expect(await db.collection('knowledge_audit').countDocuments({ entryId: id })).toBe(3);
  });
});
