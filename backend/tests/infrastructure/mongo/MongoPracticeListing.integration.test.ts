import { MongoClient, type Db } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MessageCategory } from '../../../src/contexts/classification/domain/value-objects/MessageCategory.js';
import { MongoClassificationResultRepository } from '../../../src/contexts/classification/infrastructure/adapters/out/mongo/MongoClassificationResultRepository.js';
import { MongoConsolidatedMessageRegistry } from '../../../src/contexts/ingestion/infrastructure/adapters/out/mongo/MongoConsolidatedMessageRegistry.js';
import { MongoConvocatoriaAuditLog } from '../../../src/contexts/ingestion/infrastructure/adapters/out/mongo/MongoConvocatoriaAuditLog.js';
import { PracticeModality } from '../../../src/contexts/practices/domain/entities/PracticeOffer.js';
import { MongoPracticeOfferRepository } from '../../../src/contexts/practices/infrastructure/adapters/out/mongo/MongoPracticeOfferRepository.js';
import { MongoProgramTargetingRepository } from '../../../src/contexts/targeting/infrastructure/adapters/out/mongo/MongoProgramTargetingRepository.js';
import { ADMIN, buildPracticesHarness, validForm } from '../../practices/practicesHarness.js';

const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
// Base propia: comparte nombres de coleccion con otras pruebas de integracion que corren en paralelo.
const DATABASE = `${process.env['MONGODB_TEST_DATABASE'] ?? 'upb_conecta_test'}_practice_listing`;

describe('Listado de ofertas de práctica sobre MongoDB — HU-22 (integración contra MongoDB real)', () => {
  let client: MongoClient;
  let db: Db;

  beforeAll(async () => {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DATABASE);
    await db.dropDatabase();
    await MongoConsolidatedMessageRegistry.ensureIndexes(db);
    await MongoPracticeOfferRepository.ensureIndexes(db);
    await MongoConvocatoriaAuditLog.ensureIndexes(db);
  });

  afterAll(async () => {
    await db.dropDatabase();
    await client.close();
  });

  it('el registro consolidado resuelve varios representantes en una consulta y tolera una lista vacía', async () => {
    const registry = new MongoConsolidatedMessageRegistry(db);
    const base = { body: 'b', firstSentAt: new Date('2026-09-01T00:00:00Z'), lastSentAt: new Date('2026-09-01T00:00:00Z'), resendCount: 0, dueDate: { kind: 'sin-vencimiento' as const }, applicationLink: null, withdrawnAt: null };
    await registry.save({ ...base, sender: 's', subject: 'uno', representativeMessageId: 'batch-1' });
    await registry.save({ ...base, sender: 's', subject: 'dos', representativeMessageId: 'batch-2' });
    await registry.save({ ...base, sender: 's', subject: 'tres', representativeMessageId: 'batch-3' });

    const found = await registry.findByRepresentativeMessageIds(['batch-1', 'batch-3', 'no-existe']);

    expect(found.map((record) => record.subject).sort()).toEqual(['tres', 'uno']);
    expect(await registry.findByRepresentativeMessageIds([])).toEqual([]);
  });

  it('el repositorio de ofertas resuelve varias por id en una consulta', async () => {
    const offers = new MongoPracticeOfferRepository(db);
    const details = (messageId: string) => ({
      messageId,
      convocatoriaId: { sender: 's', subject: messageId, firstSentAt: new Date('2026-09-01T00:00:00Z') },
      company: messageId,
      requirements: 'r',
      modality: PracticeModality.REMOTE,
      createdBy: ADMIN,
      createdAt: new Date('2026-09-01T00:00:00Z'),
      updatedBy: ADMIN,
      updatedAt: new Date('2026-09-01T00:00:00Z'),
      withdrawnAt: null
    });
    await offers.save(details('o-1'));
    await offers.save(details('o-2'));

    const found = await offers.findByMessageIds(['o-1', 'o-2', 'o-3']);

    expect([...found.keys()].sort()).toEqual(['o-1', 'o-2']);
    expect(found.get('o-2')?.company).toBe('o-2');
    expect((await offers.findByMessageIds([])).size).toBe(0);
  });

  it('lista y consolida contra las colecciones reales: una carga manual repetida no duplica el registro', async () => {
    const practices = buildPracticesHarness({
      registry: new MongoConsolidatedMessageRegistry(db),
      classifications: new MongoClassificationResultRepository(db),
      targetingRepo: new MongoProgramTargetingRepository(db),
      auditLog: new MongoConvocatoriaAuditLog(db),
      offers: new MongoPracticeOfferRepository(db)
    });
    const first = await practices.publish.execute({ form: validForm({ company: 'Mongo Corp', applicationChannel: 'https://mongo.example.com/p' }), publishedBy: ADMIN });
    const again = await practices.publish.execute({
      form: validForm({ company: 'Mongo Corp', applicationChannel: 'https://MONGO.example.com/p/?utm_source=x', requirements: 'Nuevos requisitos' }),
      publishedBy: ADMIN
    });
    if (!first.ok || !again.ok) throw new Error('la publicación debía ser válida');

    expect(again.consolidated).toBe(true);
    expect(again.offer.messageId).toBe(first.offer.messageId);
    const listing = await practices.list.execute({ modality: 'hibrida' });
    if (!listing.ok) throw new Error(listing.message);
    const mine = listing.offers.filter((offer) => offer.offerId === first.offer.messageId);
    expect(mine).toHaveLength(1);
    expect(await db.collection('ingestion_consolidated_messages').countDocuments({ representativeMessageId: first.offer.messageId })).toBe(1);
    expect(await practices.detail.execute({ offerId: first.offer.messageId })).toMatchObject({ company: 'Mongo Corp', requirements: 'Nuevos requisitos', missingFields: [] });
    expect(await practices.classifications.findByMessageId(first.offer.messageId)).toMatchObject({ finalCategory: MessageCategory.PRACTICA });
    expect(await practices.detail.execute({ offerId: 'inexistente' })).toBeNull();
  });
});
