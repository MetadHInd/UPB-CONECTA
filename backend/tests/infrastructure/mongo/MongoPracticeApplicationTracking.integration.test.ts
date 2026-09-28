import { MongoClient, type Db } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoClassificationResultRepository } from '../../../src/contexts/classification/infrastructure/adapters/out/mongo/MongoClassificationResultRepository.js';
import { MongoConsolidatedMessageRegistry } from '../../../src/contexts/ingestion/infrastructure/adapters/out/mongo/MongoConsolidatedMessageRegistry.js';
import { MongoConvocatoriaAuditLog } from '../../../src/contexts/ingestion/infrastructure/adapters/out/mongo/MongoConvocatoriaAuditLog.js';
import { PracticeApplicationStatus } from '../../../src/contexts/practices/domain/entities/PracticeApplicationTracking.js';
import { MongoPracticeApplicationTrackingRepository } from '../../../src/contexts/practices/infrastructure/adapters/out/mongo/MongoPracticeApplicationTrackingRepository.js';
import { MongoPracticeOfferRepository } from '../../../src/contexts/practices/infrastructure/adapters/out/mongo/MongoPracticeOfferRepository.js';
import { MongoProgramTargetingRepository } from '../../../src/contexts/targeting/infrastructure/adapters/out/mongo/MongoProgramTargetingRepository.js';
import { ADMIN, buildPracticesHarness, validForm } from '../../practices/practicesHarness.js';

const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
// Base propia: comparte nombres de coleccion con otras pruebas de integracion que corren en paralelo.
const DATABASE = `${process.env['MONGODB_TEST_DATABASE'] ?? 'upb_conecta_test'}_practice_tracking`;

const ANA = 'ana@upb.edu.co';
const LUIS = 'luis@upb.edu.co';

describe('Seguimiento de postulaciones sobre MongoDB — HU-23 (integración contra MongoDB real)', () => {
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
    await MongoPracticeApplicationTrackingRepository.ensureIndexes(db);
  });

  afterAll(async () => {
    await db.dropDatabase();
    await client.close();
  });

  function harness() {
    return buildPracticesHarness({
      registry: new MongoConsolidatedMessageRegistry(db),
      classifications: new MongoClassificationResultRepository(db),
      targetingRepo: new MongoProgramTargetingRepository(db),
      auditLog: new MongoConvocatoriaAuditLog(db),
      offers: new MongoPracticeOfferRepository(db),
      trackings: new MongoPracticeApplicationTrackingRepository(db)
    });
  }

  it('persiste el estado con su historial, lo agrupa, avisa a quien lo sigue y lo informa al retirarse', async () => {
    const practices = harness();
    const published = await practices.publish.execute({ form: validForm(), publishedBy: ADMIN });
    if (!published.ok) throw new Error(published.message);
    const offerId = published.offer.messageId;
    const first = practices.now();

    await practices.track.execute({ studentId: LUIS, offerId, status: 'interesado' });
    const later = new Date(first.getTime() + 3_600_000);
    practices.setNow(later);
    const updated = await practices.track.execute({ studentId: LUIS, offerId, status: 'postulado' });
    if (!updated.ok) throw new Error(updated.message);

    const stored = await db.collection(MongoPracticeApplicationTrackingRepository.COLLECTION).findOne({ _id: `${LUIS}|${offerId}` as never });
    expect(stored).toMatchObject({ studentId: LUIS, offerId, status: 'postulado', createdAt: first, updatedAt: later });
    expect(await practices.trackings.findByStudentAndOffer(LUIS, offerId)).toEqual(updated.tracking);
    expect(updated.tracking.history).toEqual([
      { status: 'interesado', at: first },
      { status: 'postulado', at: later }
    ]);

    // Criterio 3 con el planificador real: Luis (psicologia) no esta en la segmentacion, pero la sigue.
    practices.setNow(new Date('2026-10-14T22:00:00Z'));
    expect((await practices.reminderCycle()).sort()).toEqual([ANA, LUIS]);

    // Criterio 6: retirada, sigue en su seguimiento.
    await practices.withdraw.execute({ messageId: offerId, withdrawnBy: ADMIN });
    const view = await practices.tracking.execute({ studentId: LUIS });
    expect(view.groups.find((group) => group.status === PracticeApplicationStatus.APPLIED)?.applications).toEqual([
      expect.objectContaining({ offerId, situation: 'retirada' })
    ]);
  });

  it('busca seguidores por oferta y estado, y borra solo lo del estudiante', async () => {
    const repo = new MongoPracticeApplicationTrackingRepository(db, 'practice_application_tracking_repo');
    const at = new Date('2026-09-26T15:00:00Z');
    const base = { offerTitle: 'Oferta', company: null, createdAt: at, updatedAt: at };
    for (const [studentId, offerId, status] of [
      [ANA, 'o1', PracticeApplicationStatus.INTERESTED],
      [LUIS, 'o1', PracticeApplicationStatus.IN_PROCESS],
      [LUIS, 'o2', PracticeApplicationStatus.APPLIED],
      [ANA, 'o3', PracticeApplicationStatus.APPLIED]
    ] as const) {
      await repo.save({ ...base, studentId, offerId, status, history: [{ status, at }] });
    }

    const followers = await repo.findTrackingStudents(['o1', 'o2'], [PracticeApplicationStatus.INTERESTED, PracticeApplicationStatus.APPLIED]);
    expect(Object.fromEntries(followers)).toEqual({ o1: [ANA], o2: [LUIS] });
    expect(await repo.findTrackingStudents([], [PracticeApplicationStatus.APPLIED])).toEqual(new Map());

    expect(await repo.deleteAllByStudent(ANA)).toBe(2);
    expect(await repo.findByStudent(ANA)).toEqual([]);
    expect(await repo.findByStudent(LUIS)).toHaveLength(2);

    const indexes = (await db.collection(MongoPracticeApplicationTrackingRepository.COLLECTION).indexes()).map((index) => index.name);
    expect(indexes).toEqual(expect.arrayContaining(['idx_student_updated', 'idx_offer_status']));
  });
});
