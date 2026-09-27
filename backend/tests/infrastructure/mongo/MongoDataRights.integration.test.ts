import { MongoClient, type Db } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { completeErasure, openErasureRequest } from '../../../src/contexts/datarights/domain/entities/ErasureRequest.js';
import { loadRetentionPolicy } from '../../../src/contexts/datarights/infrastructure/config/JsonRetentionPolicy.js';
import { MongoConvocatoriaArchive } from '../../../src/contexts/datarights/infrastructure/adapters/out/mongo/MongoConvocatoriaArchive.js';
import { MongoErasureRequestRepository } from '../../../src/contexts/datarights/infrastructure/adapters/out/mongo/MongoErasureRequestRepository.js';
import { MongoRectificationLog } from '../../../src/contexts/datarights/infrastructure/adapters/out/mongo/MongoRectificationLog.js';
import { MongoForumModerationDissociation } from '../../../src/contexts/datarights/infrastructure/integration/ForumModerationDissociation.js';
import { MongoConsolidatedConvocatoriaSource } from '../../../src/contexts/datarights/infrastructure/integration/MongoConsolidatedConvocatoriaSource.js';
import { InfractionOutcome } from '../../../src/contexts/forum/domain/entities/Infraction.js';
import { SanctionLevel } from '../../../src/contexts/forum/domain/entities/Sanction.js';
import { MongoForumAccessAuditLog } from '../../../src/contexts/forum/infrastructure/adapters/out/mongo/MongoForumAccessAuditLog.js';
import { MongoForumAuthorRepository } from '../../../src/contexts/forum/infrastructure/adapters/out/mongo/MongoForumAuthorRepository.js';
import { MongoInfractionRepository } from '../../../src/contexts/forum/infrastructure/adapters/out/mongo/MongoInfractionRepository.js';
import { MongoPostRepository } from '../../../src/contexts/forum/infrastructure/adapters/out/mongo/MongoPostRepository.js';
import { MongoSanctionAuditLog } from '../../../src/contexts/forum/infrastructure/adapters/out/mongo/MongoSanctionAuditLog.js';
import { MongoSanctionNoticeOutbox } from '../../../src/contexts/forum/infrastructure/adapters/out/mongo/MongoSanctionNoticeOutbox.js';
import { MongoSanctionRepository } from '../../../src/contexts/forum/infrastructure/adapters/out/mongo/MongoSanctionRepository.js';
import { MongoDeviceRegistry } from '../../../src/contexts/notifications/infrastructure/adapters/out/mongo/MongoDeviceRegistry.js';
import { MongoNotificationPreferencesRepository } from '../../../src/contexts/notifications/infrastructure/adapters/out/mongo/MongoNotificationPreferencesRepository.js';
import { MongoPersonalStateRepository } from '../../../src/contexts/personalization/infrastructure/adapters/out/mongo/MongoPersonalStateRepository.js';
import { StudentProfile } from '../../../src/contexts/profile/domain/entities/StudentProfile.js';
import { createSemesterBounds } from '../../../src/contexts/profile/domain/value-objects/SemesterNumber.js';
import { MongoStudentProfileRepository } from '../../../src/contexts/profile/infrastructure/adapters/out/mongo/MongoStudentProfileRepository.js';

const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
const DATABASE = process.env['MONGODB_TEST_DATABASE'] ?? 'upb_conecta_test';
const C = {
  requests: 'datarights_requests_test',
  rectifications: 'datarights_rectifications_test',
  archive: 'datarights_archive_test',
  consolidated: 'datarights_consolidated_test',
  profiles: 'datarights_profiles_test',
  states: 'datarights_states_test',
  devices: 'datarights_devices_test',
  preferences: 'datarights_preferences_test',
  posts: 'datarights_posts_test',
  authors: 'datarights_authors_test',
  infractions: 'datarights_infractions_test',
  sanctions: 'datarights_sanctions_test',
  sanctionAudit: 'datarights_sanction_audit_test',
  accessAudit: 'datarights_access_audit_test',
  notices: 'datarights_notices_test'
};
const T0 = new Date('2026-09-22T12:00:00Z');
const ANA = 'ana@upb.edu.co';
const LUIS = 'luis@upb.edu.co';
const BOUNDS = createSemesterBounds(12);
const policy = loadRetentionPolicy();

describe('Adaptadores Mongo de derechos del titular — HU-48 (integración contra MongoDB real)', () => {
  let client: MongoClient;
  let db: Db;

  beforeAll(async () => {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DATABASE);
    await MongoErasureRequestRepository.ensureIndexes(db, C.requests);
    await MongoRectificationLog.ensureIndexes(db, C.rectifications);
  });

  beforeEach(async () => {
    for (const name of Object.values(C)) await db.collection(name).deleteMany({});
  });

  afterAll(async () => {
    for (const name of Object.values(C)) await db.collection(name).drop().catch(() => undefined);
    await client.close();
  });

  it('MongoErasureRequestRepository: guarda, encuentra pendientes por titular y conserva la solicitud completada sin correo', async () => {
    const repo = new MongoErasureRequestRepository(db, C.requests);
    const open = openErasureRequest('r-1', ANA, T0, policy);
    await repo.save(open);
    await repo.save(openErasureRequest('r-2', LUIS, T0, policy));

    expect(await repo.findById('r-1')).toEqual(open);
    expect((await repo.findPendingBySubject(ANA))?.id).toBe('r-1');
    expect(await repo.findPending()).toHaveLength(2);
    expect(await repo.findById('no-existe')).toBeNull();

    await repo.save(completeErasure(open, { executedAt: T0, pseudonym: 'titular-suprimido-x', erasedCounts: { profile: 1 }, dissociatedRecords: 3 }));

    expect(await repo.findPendingBySubject(ANA)).toBeNull();
    const stored = await db.collection(C.requests).findOne({ _id: 'r-1' as never });
    expect(JSON.stringify(stored)).not.toContain(ANA);
  });

  it('MongoErasureRequestRepository: un correo con forma de operador no coincide con nada (sin inyección NoSQL)', async () => {
    const repo = new MongoErasureRequestRepository(db, C.requests);
    await repo.save(openErasureRequest('r-1', ANA, T0, policy));

    expect(await repo.findPendingBySubject({ $ne: null } as unknown as string)).toBeNull();
  });

  it('MongoRectificationLog: historial por titular, más reciente primero, y borrado del titular', async () => {
    const log = new MongoRectificationLog(db, C.rectifications);
    await log.record({ subject: ANA, field: 'semester', previousValue: 5, newValue: 6, rectifiedAt: T0 });
    await log.record({ subject: ANA, field: 'semester', previousValue: 6, newValue: 7, rectifiedAt: new Date(T0.getTime() + 1000) });
    await log.record({ subject: LUIS, field: 'semester', previousValue: 1, newValue: 2, rectifiedAt: T0 });

    expect((await log.findBySubject(ANA)).map((e) => e.newValue)).toEqual([7, 6]);
    expect(await log.deleteBySubject(ANA)).toBe(2);
    expect(await log.findBySubject(ANA)).toEqual([]);
    expect(await log.findBySubject(LUIS)).toHaveLength(1);
  });

  it('MongoConvocatoriaArchive: archivar dos veces la misma convocatoria es un no-op', async () => {
    const archive = new MongoConvocatoriaArchive(db, C.archive);
    const record = { convocatoriaId: 'c-1', dueAt: T0, archivedAt: T0 };

    expect(await archive.archive(record)).toBe(true);
    expect(await archive.archive({ ...record, archivedAt: new Date(T0.getTime() + 1) })).toBe(false);
    expect(await archive.findAll()).toEqual([record]);
  });

  it('MongoConsolidatedConvocatoriaSource: lista solo las convocatorias con fecha de cierre', async () => {
    await db.collection(C.consolidated).insertMany([
      { _id: 'a' as never, sender: 's', subject: 'Con fecha', firstSentAt: T0, dueDate: { kind: 'con-fecha', date: T0 } },
      { _id: 'b' as never, sender: 's', subject: 'Sin', firstSentAt: T0, dueDate: { kind: 'sin-vencimiento' } }
    ]);

    const found = await new MongoConsolidatedConvocatoriaSource(db, C.consolidated).findWithDueDate();

    expect(found).toEqual([{ convocatoriaId: `s|Con fecha|${T0.getTime()}`, dueAt: T0 }]);
  });

  it('repositorios de otros contextos: consulta y supresión por titular sin tocar a otros', async () => {
    const profiles = new MongoStudentProfileRepository(db, BOUNDS, C.profiles);
    await profiles.save(StudentProfile.fromDirectory({ name: 'A', email: ANA, program: 'x', semester: 4 }, 'sistemas', BOUNDS, T0));
    await profiles.save(StudentProfile.fromDirectory({ name: 'L', email: LUIS, program: 'x', semester: 4 }, 'sistemas', BOUNDS, T0));
    expect(await profiles.delete(ANA)).toBe(true);
    expect(await profiles.delete(ANA)).toBe(false);
    expect(await profiles.findByEmail(LUIS)).not.toBeNull();

    const states = new MongoPersonalStateRepository(db, C.states);
    for (const [studentId, convocatoriaId] of [[ANA, 'c-1'], [ANA, 'c-2'], [LUIS, 'c-1']] as const) {
      await states.save({ studentId, convocatoriaId, read: true, saved: false, archived: false, updatedAt: T0 });
    }
    expect(await states.findAllByStudent(ANA)).toHaveLength(2);
    expect(await states.deleteAllByStudent(ANA)).toBe(2);
    expect(await states.findAllByStudent(LUIS)).toHaveLength(1);

    const devices = new MongoDeviceRegistry(db, C.devices);
    await devices.register(ANA, 'tok-1', T0);
    await devices.register(ANA, 'tok-2', T0);
    await devices.invalidate('tok-2', 'logout', T0);
    await devices.register(LUIS, 'tok-3', T0);
    expect(await devices.findAllForStudent(ANA)).toHaveLength(2);
    expect(await devices.deleteAllForStudent(ANA)).toBe(2);
    expect(await devices.findAllForStudent(LUIS)).toHaveLength(1);

    const preferences = new MongoNotificationPreferencesRepository(db, C.preferences);
    await preferences.save({ studentId: ANA, categoryPreferences: {}, leadTimeMinutes: 60, theme: 'dark', updatedAt: T0 });
    expect(await preferences.delete(ANA)).toBe(true);
    expect(await preferences.delete(ANA)).toBe(false);

    const authors = new MongoForumAuthorRepository(db, C.authors);
    await authors.save({ email: ANA, name: 'Ana', programName: 'Sistemas', programId: 'sistemas', syncedAt: T0 });
    expect(await authors.delete(ANA)).toBe(true);
    expect(await authors.findByEmail(ANA)).toBeNull();

    const posts = new MongoPostRepository(db, C.posts);
    const author = { email: ANA, name: 'Ana', programName: 'Sistemas', programId: null };
    await posts.save({ id: 'p-1', topicId: 'general', author, title: 'T', text: 'X', publishedAt: T0 });
    await posts.save({ id: 'p-2', topicId: 'general', author: { ...author, email: LUIS }, title: 'T', text: 'X', publishedAt: T0 });
    expect((await posts.findByAuthor(ANA)).map((p) => p.id)).toEqual(['p-1']);
    expect(await posts.deleteByAuthor(ANA)).toBe(1);
    expect((await posts.findByTopic('general')).map((p) => p.id)).toEqual(['p-2']);
  });

  it('MongoForumModerationDissociation: reemplaza al titular por el seudonimo en infracciones, sanciones, auditoría, accesos y avisos', async () => {
    const infractions = new MongoInfractionRepository(db, C.infractions);
    const sanctions = new MongoSanctionRepository(db, C.sanctions);
    const sanctionAudit = new MongoSanctionAuditLog(db, C.sanctionAudit);
    const accessAudit = new MongoForumAccessAuditLog(db, C.accessAudit);
    const notices = new MongoSanctionNoticeOutbox(db, C.notices);
    const infraction = (studentEmail: string, id: string) => ({
      id,
      studentEmail,
      content: { kind: 'post' as const, id, topicId: 'general', title: 'T', text: 'Contenido' },
      outcome: InfractionOutcome.BLOCKED,
      reason: 'Lenguaje ofensivo',
      detectedBy: 'automatic-moderation',
      occurredAt: T0
    });
    await infractions.create(infraction(ANA, 'post:1'));
    await infractions.create(infraction(LUIS, 'post:2'));
    const sanction = {
      id: 's-1',
      studentEmail: ANA,
      level: SanctionLevel.WARNING,
      reason: 'Motivo',
      startsAt: T0,
      endsAt: T0,
      revokedAt: null,
      infractionCount: 1,
      triggeredByInfractionId: 'post:1',
      imposedAt: T0,
      revocation: null
    };
    await sanctions.save(sanction);
    await sanctionAudit.record({ kind: 'sanction-imposed', sanctionId: 's-1', studentEmail: ANA, level: SanctionLevel.WARNING, triggeredByInfractionId: 'post:1', performedBy: 'system', occurredAt: T0 });
    await accessAudit.record({ kind: 'topic-access-denied', operation: 'read', studentEmail: ANA, studentProgramId: null, topicId: 't', occurredAt: T0 });
    await notices.notifyStudent({ kind: 'sanction-revoked', sanctionId: 's-1', studentEmail: ANA, message: 'm' });
    await notices.notifyAdministrators({ kind: 'sanction-revoked', sanctionId: 's-1', studentEmail: ANA, message: 'm' });

    const dissociation = new MongoForumModerationDissociation(db, {
      infractions: C.infractions,
      sanctions: C.sanctions,
      sanctionAudit: C.sanctionAudit,
      accessAudit: C.accessAudit,
      notices: C.notices
    });
    expect(await dissociation.dissociate(ANA, 'titular-suprimido-1')).toBe(6);
    expect(await dissociation.dissociate(ANA, 'titular-suprimido-2')).toBe(0);

    for (const name of [C.infractions, C.sanctions, C.sanctionAudit, C.accessAudit, C.notices]) {
      expect(JSON.stringify(await db.collection(name).find({}).toArray())).not.toContain(ANA);
    }
    expect(await infractions.findByStudent('titular-suprimido-1')).toHaveLength(1);
    expect((await infractions.findByStudent('titular-suprimido-1'))[0]?.reason).toBe('Lenguaje ofensivo');
    expect(await sanctions.findSanctions('titular-suprimido-1')).toHaveLength(1);
    expect(await infractions.findByStudent(LUIS)).toHaveLength(1);
    expect(await db.collection(C.notices).countDocuments({ recipient: 'titular-suprimido-1' })).toBe(1);
    expect(await db.collection(C.notices).countDocuments({ recipient: 'content-admins' })).toBe(1);
  });
});
