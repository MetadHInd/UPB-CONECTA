import { MongoClient, type Db } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MessageCategory } from '../../../src/contexts/classification/domain/value-objects/MessageCategory.js';
import { MongoClassificationResultRepository } from '../../../src/contexts/classification/infrastructure/adapters/out/mongo/MongoClassificationResultRepository.js';
import { ConvocatoriaAuditEventKind } from '../../../src/contexts/ingestion/domain/ports/out/ConvocatoriaAuditLogPort.js';
import { MongoConsolidatedMessageRegistry } from '../../../src/contexts/ingestion/infrastructure/adapters/out/mongo/MongoConsolidatedMessageRegistry.js';
import { MongoConvocatoriaAuditLog } from '../../../src/contexts/ingestion/infrastructure/adapters/out/mongo/MongoConvocatoriaAuditLog.js';
import { PracticeModality } from '../../../src/contexts/practices/domain/entities/PracticeOffer.js';
import { MongoPracticeOfferRepository } from '../../../src/contexts/practices/infrastructure/adapters/out/mongo/MongoPracticeOfferRepository.js';
import { MongoProgramTargetingRepository } from '../../../src/contexts/targeting/infrastructure/adapters/out/mongo/MongoProgramTargetingRepository.js';
import { ADMIN, buildPracticesHarness, validForm } from '../../practices/practicesHarness.js';

const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
// Base propia: comparte nombres de coleccion con otras pruebas de integracion que corren en paralelo.
const DATABASE = `${process.env['MONGODB_TEST_DATABASE'] ?? 'upb_conecta_test'}_practices`;

describe('Ofertas de práctica sobre MongoDB — HU-24 (integración contra MongoDB real)', () => {
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

  it('publica, edita y retira escribiendo en las colecciones de la ingesta, con auditoría append-only', async () => {
    const practices = buildPracticesHarness({
      registry: new MongoConsolidatedMessageRegistry(db),
      classifications: new MongoClassificationResultRepository(db),
      targetingRepo: new MongoProgramTargetingRepository(db),
      auditLog: new MongoConvocatoriaAuditLog(db),
      offers: new MongoPracticeOfferRepository(db)
    });

    const published = await practices.publish.execute({ form: validForm(), publishedBy: ADMIN });
    if (!published.ok) throw new Error(published.message);
    const { messageId } = published.offer;

    expect(await db.collection('ingestion_consolidated_messages').countDocuments({ representativeMessageId: messageId })).toBe(1);
    expect(await practices.classifications.findByMessageId(messageId)).toMatchObject({ finalCategory: MessageCategory.PRACTICA });
    expect(await practices.offers.findByMessageId(messageId)).toEqual(published.offer);

    const edited = await practices.edit.execute({
      messageId,
      form: { modality: 'presencial', targeting: { kind: 'faculty', facultyId: 'ingenieria' }, dueDate: '2026-10-20T22:00:00Z' },
      editedBy: ADMIN
    });
    expect(edited).toMatchObject({ ok: true, changedFields: ['dueDate', 'targeting', 'modality'] });
    expect(await practices.offers.findByMessageId(messageId)).toMatchObject({ modality: PracticeModality.ON_SITE });
    expect((await practices.targetingRepo.findByMessageId(messageId))?.targeting).toEqual({ kind: 'faculty', facultyId: 'ingenieria' });
    expect((await practices.registry.findByRepresentativeMessageId(messageId))?.dueDate).toEqual({
      kind: 'con-fecha',
      date: new Date('2026-10-20T22:00:00Z')
    });
    // Editar no cambia la identidad: sigue siendo un solo documento consolidado.
    expect(await db.collection('ingestion_consolidated_messages').countDocuments({ representativeMessageId: messageId })).toBe(1);

    expect(await practices.withdraw.execute({ messageId, withdrawnBy: ADMIN })).toMatchObject({ ok: true });
    expect((await practices.registry.findByRepresentativeMessageId(messageId))?.withdrawnAt).toBeInstanceOf(Date);

    const audit = await db
      .collection(MongoConvocatoriaAuditLog.COLLECTION)
      .find({ messageId }, { projection: { _id: 0, kind: 1, actor: 1, changedFields: 1 } })
      .toArray();
    expect(audit).toEqual([
      { kind: ConvocatoriaAuditEventKind.PUBLISHED, actor: ADMIN },
      { kind: ConvocatoriaAuditEventKind.EDITED, actor: ADMIN, changedFields: ['dueDate', 'targeting', 'modality'] },
      { kind: ConvocatoriaAuditEventKind.WITHDRAWN, actor: ADMIN }
    ]);
  });

  it('MongoPracticeOfferRepository: una oferta por messageId, reemplazable, con índice por modalidad', async () => {
    const repo = new MongoPracticeOfferRepository(db);
    const offer = {
      messageId: 'manual-x@upb-conecta.local',
      convocatoriaId: { sender: ADMIN, subject: 'Oferta de práctica en X', firstSentAt: new Date('2026-09-26T15:00:00Z') },
      company: 'X',
      requirements: 'R',
      modality: PracticeModality.REMOTE,
      createdBy: ADMIN,
      createdAt: new Date('2026-09-26T15:00:00Z'),
      updatedBy: ADMIN,
      updatedAt: new Date('2026-09-26T15:00:00Z'),
      withdrawnAt: null
    };

    await repo.save(offer);
    await repo.save({ ...offer, requirements: 'R2' });

    expect(await repo.findByMessageId(offer.messageId)).toEqual({ ...offer, requirements: 'R2' });
    expect(await repo.findByMessageId('no-existe')).toBeNull();
    expect(await db.collection(MongoPracticeOfferRepository.COLLECTION).countDocuments({ _id: offer.messageId as never })).toBe(1);
    expect(await db.collection(MongoPracticeOfferRepository.COLLECTION).indexes()).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'idx_modality_withdrawn', key: { modality: 1, withdrawnAt: 1 } })])
    );
  });
});
