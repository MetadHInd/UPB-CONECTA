import { MongoClient, type Db } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PostRejectionKind } from '../../../src/contexts/forum/application/CreatePost.js';
import { InfractionOutcome, type Infraction } from '../../../src/contexts/forum/domain/entities/Infraction.js';
import { revokeSanction, SanctionLevel, type SanctionRecord } from '../../../src/contexts/forum/domain/entities/Sanction.js';
import { SanctionThresholds } from '../../../src/contexts/forum/domain/value-objects/SanctionThresholds.js';
import { MongoInfractionRepository } from '../../../src/contexts/forum/infrastructure/adapters/out/mongo/MongoInfractionRepository.js';
import { MongoSanctionAuditLog } from '../../../src/contexts/forum/infrastructure/adapters/out/mongo/MongoSanctionAuditLog.js';
import {
  ADMINISTRATORS_RECIPIENT,
  MongoSanctionNoticeOutbox
} from '../../../src/contexts/forum/infrastructure/adapters/out/mongo/MongoSanctionNoticeOutbox.js';
import { MongoSanctionRepository } from '../../../src/contexts/forum/infrastructure/adapters/out/mongo/MongoSanctionRepository.js';
import { MongoSanctionThresholdsRepository } from '../../../src/contexts/forum/infrastructure/adapters/out/mongo/MongoSanctionThresholdsRepository.js';
import { buildForumHarness } from '../../forum/forumHarness.js';

const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
const DATABASE = process.env['MONGODB_TEST_DATABASE'] ?? 'upb_conecta_test';
const C = {
  infractions: 'forum_infractions_test',
  sanctions: 'forum_sanctions_test',
  thresholds: 'forum_sanction_thresholds_test',
  audit: 'forum_sanction_audit_test',
  notices: 'forum_sanction_notices_test'
};
const T0 = new Date('2026-09-22T12:00:00Z');
const ANA = 'ana@upb.edu.co';

const infraction = (overrides: Partial<Infraction> = {}): Infraction => ({
  id: 'post:p-1',
  studentEmail: ANA,
  content: { kind: 'post', id: 'p-1', topicId: 'general', title: 'Título', text: 'Texto' },
  outcome: InfractionOutcome.RETAINED,
  reason: 'Lenguaje ofensivo',
  detectedBy: 'automatic-moderation',
  occurredAt: T0,
  ...overrides
});

const sanction = (overrides: Partial<SanctionRecord> = {}): SanctionRecord => ({
  id: 's-1',
  studentEmail: ANA,
  level: SanctionLevel.TEMPORARY_SUSPENSION,
  reason: 'Motivo',
  startsAt: T0,
  endsAt: new Date(T0.getTime() + 7 * 86_400_000),
  revokedAt: null,
  infractionCount: 3,
  triggeredByInfractionId: 'post:p-3',
  imposedAt: T0,
  revocation: null,
  ...overrides
});

describe('Adaptadores Mongo de sanciones del foro — HU-35 (integración contra MongoDB real)', () => {
  let client: MongoClient;
  let db: Db;

  beforeAll(async () => {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DATABASE);
    await MongoInfractionRepository.ensureIndexes(db, C.infractions);
    await MongoSanctionRepository.ensureIndexes(db, C.sanctions);
    await MongoSanctionAuditLog.ensureIndexes(db, C.audit);
    await MongoSanctionNoticeOutbox.ensureIndexes(db, C.notices);
  });

  beforeEach(async () => {
    for (const name of Object.values(C)) await db.collection(name).deleteMany({});
  });

  afterAll(async () => {
    for (const name of Object.values(C)) await db.collection(name).drop().catch(() => undefined);
    await client.close();
  });

  it('MongoInfractionRepository: una infracción por contenido, actualizable y ordenada por fecha', async () => {
    const repo = new MongoInfractionRepository(db, C.infractions);

    expect(await repo.create(infraction())).toBe(true);
    expect(await repo.create(infraction({ reason: 'duplicado' }))).toBe(false);
    await repo.update(infraction({ outcome: InfractionOutcome.BLOCKED }));
    await repo.create(infraction({ id: 'post:p-2', occurredAt: new Date(T0.getTime() + 1000) }));
    await repo.create(infraction({ id: 'post:p-3', studentEmail: 'luis@upb.edu.co' }));

    expect(await repo.findById('post:p-1')).toEqual(infraction({ outcome: InfractionOutcome.BLOCKED }));
    expect((await repo.findByStudent(ANA)).map((i) => i.id)).toEqual(['post:p-2', 'post:p-1']);
    expect(await repo.findById('no-existe')).toBeNull();
    expect(await db.collection(C.infractions).indexes()).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'idx_student_occurred' })])
    );
  });

  it('MongoSanctionRepository: guarda, revoca y devuelve las sanciones del estudiante', async () => {
    const repo = new MongoSanctionRepository(db, C.sanctions);
    await repo.save(sanction());
    await repo.save(sanction({ id: 's-0', level: SanctionLevel.WARNING, imposedAt: new Date(T0.getTime() - 1000) }));

    const revoked = revokeSanction(sanction(), { revokedBy: 'admin@upb.edu.co', reason: 'Improcedente', revokedAt: T0 });
    await repo.update(revoked);

    expect(await repo.findById('s-1')).toEqual(revoked);
    expect((await repo.findSanctions(ANA)).map((s) => s.id)).toEqual(['s-1', 's-0']);
    expect(await repo.findSanctions('luis@upb.edu.co')).toEqual([]);
    expect(await db.collection(C.sanctions).indexes()).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'idx_student_imposed', key: { studentEmail: 1, imposedAt: -1 } })])
    );
  });

  it('MongoSanctionThresholdsRepository: valores por defecto sin documento y ajuste persistido', async () => {
    const repo = new MongoSanctionThresholdsRepository(db, C.thresholds);
    expect(await repo.get()).toEqual({ thresholds: SanctionThresholds.default(), updatedBy: null, updatedAt: null });

    const custom = SanctionThresholds.of({ ...SanctionThresholds.default().values, warningAt: 2 });
    await repo.set(custom, { updatedBy: 'admin@upb.edu.co', updatedAt: T0 });
    await repo.set(custom, { updatedBy: 'admin@upb.edu.co', updatedAt: T0 });

    expect(await repo.get()).toEqual({ thresholds: custom, updatedBy: 'admin@upb.edu.co', updatedAt: T0 });
    expect(await db.collection(C.thresholds).countDocuments()).toBe(1);
  });

  it('MongoSanctionThresholdsRepository: un documento incoherente editado a mano no se acepta', async () => {
    await db.collection(C.thresholds).insertOne({
      _id: 'current' as never,
      values: { ...SanctionThresholds.default().values, warningAt: 9 },
      updatedBy: 'x',
      updatedAt: T0
    });

    await expect(new MongoSanctionThresholdsRepository(db, C.thresholds).get()).rejects.toThrow('los niveles deben crecer');
  });

  it('flujo completo: el historial en Mongo sanciona, CreatePost rechaza, se audita y se avisa por la bandeja', async () => {
    const forum = buildForumHarness({
      infractions: new MongoInfractionRepository(db, C.infractions),
      sanctions: new MongoSanctionRepository(db, C.sanctions),
      thresholds: new MongoSanctionThresholdsRepository(db, C.thresholds)
    });
    await forum.seed.execute(forum.seedTopics);
    await forum.login('ana');
    await forum.manageThresholds.update({ values: { warningAt: 1, temporarySuspensionAt: 2 }, performedBy: 'admin@upb.edu.co' });

    for (const n of [1, 2]) {
      await forum.recordInfraction.execute({
        studentEmail: ANA,
        content: { kind: 'post', id: `p-${n}`, topicId: 'general', title: null, text: 'Ofensivo' },
        outcome: InfractionOutcome.BLOCKED,
        reason: 'Lenguaje ofensivo',
        detectedBy: 'automatic-moderation'
      });
    }

    const rejected = await forum.createPost.execute({ authorEmail: ANA, topicId: 'general', body: { title: 'Hola', text: 'Texto' } });
    expect(rejected).toMatchObject({ ok: false, error: PostRejectionKind.SANCTIONED });

    const history = await forum.history.execute({ studentEmail: ANA });
    expect(history.sanctions.map((s) => s.level)).toEqual([SanctionLevel.TEMPORARY_SUSPENSION, SanctionLevel.WARNING]);

    const audit = new MongoSanctionAuditLog(db, C.audit);
    await audit.record({
      kind: 'sanction-revoked',
      sanctionId: history.sanctions[0]!.id,
      studentEmail: ANA,
      reason: 'Improcedente',
      performedBy: 'admin@upb.edu.co',
      occurredAt: T0
    });
    await audit.record({
      kind: 'sanction-revoked',
      sanctionId: history.sanctions[0]!.id,
      studentEmail: ANA,
      reason: 'Improcedente',
      performedBy: 'admin@upb.edu.co',
      occurredAt: T0
    });
    expect(await db.collection(C.audit).countDocuments({ performedBy: 'admin@upb.edu.co' })).toBe(2);

    const outbox = new MongoSanctionNoticeOutbox(db, C.notices);
    const notice = forum.notifications.toStudents[0]!;
    await outbox.notifyStudent(notice);
    await outbox.notifyAdministrators(notice);
    expect(await db.collection(C.notices).find({}, { projection: { _id: 0, recipient: 1, deliveredAt: 1, kind: 1 } }).toArray()).toEqual([
      { kind: 'sanction-imposed', recipient: ANA, deliveredAt: null },
      { kind: 'sanction-imposed', recipient: ADMINISTRATORS_RECIPIENT, deliveredAt: null }
    ]);
  });
});
