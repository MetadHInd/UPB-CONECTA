import { MongoClient, type Db } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { StudentProfile } from '../../../src/contexts/profile/domain/entities/StudentProfile.js';
import { createSemesterBounds, SemesterNumber } from '../../../src/contexts/profile/domain/value-objects/SemesterNumber.js';
import { MongoStudentProfileRepository } from '../../../src/contexts/profile/infrastructure/adapters/out/mongo/MongoStudentProfileRepository.js';
import { semesterRange } from '../../../src/contexts/targeting/domain/value-objects/SemesterRange.js';
import { programTargeting } from '../../../src/contexts/targeting/domain/value-objects/ProgramTargeting.js';
import { buildProfileHarness, DIRECTORY_PROFILE } from '../../profile/profileHarness.js';

const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
const DATABASE = process.env['MONGODB_TEST_DATABASE'] ?? 'upb_conecta_test';
const COLLECTION = 'student_profiles_test';
const BOUNDS = createSemesterBounds(12);
const T0 = new Date('2026-09-22T12:00:00Z');
const EMAIL = DIRECTORY_PROFILE.email;

describe('MongoStudentProfileRepository (integración contra MongoDB real)', () => {
  let client: MongoClient;
  let db: Db;
  let repository: MongoStudentProfileRepository;

  beforeAll(async () => {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DATABASE);
  });

  beforeEach(async () => {
    await db.collection(COLLECTION).deleteMany({});
    repository = new MongoStudentProfileRepository(db, BOUNDS, COLLECTION);
  });

  afterAll(async () => {
    await db.collection(COLLECTION).drop().catch(() => undefined);
    await client.close();
  });

  it('criterio 6: el documento guardado solo tiene la clave y lo que segmenta', async () => {
    await repository.save(StudentProfile.fromDirectory(DIRECTORY_PROFILE, 'sistemas', BOUNDS, T0));

    const doc = await db.collection(COLLECTION).findOne({ _id: EMAIL as never });

    expect(doc).toEqual({
      _id: EMAIL,
      programId: 'sistemas',
      semester: 5,
      semesterSource: 'directory',
      updatedAt: T0,
      version: 1
    });
    expect(JSON.stringify(doc)).not.toContain('Ana Gómez');
    expect(JSON.stringify(doc)).not.toContain('2024-0001');
  });

  it('recupera el perfil con su semestre, origen y versión', async () => {
    const edited = StudentProfile.fromDirectory(DIRECTORY_PROFILE, 'sistemas', BOUNDS, T0).withSemester(SemesterNumber.create(7, BOUNDS), T0);
    await repository.save(edited);

    const found = await repository.findByEmail(EMAIL);

    expect(found?.directory).toEqual({ email: EMAIL, programId: 'sistemas' });
    expect(found?.semester?.value).toBe(7);
    expect(found?.semesterSource).toBe('student');
    expect(found?.version).toBe(1);
    expect(await repository.findByEmail('nadie@upb.edu.co')).toBeNull();
  });

  it('concurrencia optimista: dos inserciones del mismo perfil, solo una gana', async () => {
    const profile = StudentProfile.fromDirectory(DIRECTORY_PROFILE, 'sistemas', BOUNDS, T0);

    const results = await Promise.all([repository.save(profile), repository.save(profile)]);

    expect(results.sort()).toEqual([false, true]);
  });

  it('concurrencia optimista: una actualización con versión vieja no escribe', async () => {
    await repository.save(StudentProfile.fromDirectory(DIRECTORY_PROFILE, 'sistemas', BOUNDS, T0));
    const loaded = (await repository.findByEmail(EMAIL))!;

    expect(await repository.save(loaded.withSemester(SemesterNumber.create(8, BOUNDS), T0))).toBe(true);
    expect(await repository.save(loaded.syncedWith(DIRECTORY_PROFILE, 'sistemas', BOUNDS, T0))).toBe(false);
    expect((await repository.findByEmail(EMAIL))?.semester?.value).toBe(8);
  });

  it('un semestre guardado que queda fuera de un rango reducido se lee como desconocido', async () => {
    await repository.save(StudentProfile.fromDirectory({ ...DIRECTORY_PROFILE, semester: 11 }, 'sistemas', BOUNDS, T0));

    const narrowed = new MongoStudentProfileRepository(db, createSemesterBounds(10), COLLECTION);

    expect((await narrowed.findByEmail(EMAIL))?.semester).toBeNull();
  });

  it('findAll (HU-19/HU-20): devuelve todos los perfiles guardados, usado por el planificador de avisos de notifications', async () => {
    await repository.save(StudentProfile.fromDirectory(DIRECTORY_PROFILE, 'sistemas', BOUNDS, T0));
    await repository.save(StudentProfile.fromDirectory({ ...DIRECTORY_PROFILE, email: 'otro@upb.edu.co' }, 'industrial', BOUNDS, T0));

    const all = await repository.findAll();

    expect(all.map((p) => p.directory.email).sort()).toEqual([EMAIL, 'otro@upb.edu.co']);
    expect(all.find((p) => p.directory.email === EMAIL)?.directory.programId).toBe('sistemas');
  });

  it('flujo completo sobre Mongo: login, edición de semestre, re-login y feed recalculado', async () => {
    const harness = buildProfileHarness({ profiles: repository });
    await harness.login();
    await harness.publish('electivas-6', { targeting: programTargeting(['sistemas']), semesterRange: semesterRange(6) });
    expect(await harness.visibleFeedIds()).toEqual([]);

    await harness.update.execute({ email: EMAIL, changes: { semester: 6 } });
    harness.changeDirectory({ program: 'sistemas', semester: 5 });
    await harness.login();

    expect(await harness.visibleFeedIds()).toEqual(['electivas-6']);
    expect(await db.collection(COLLECTION).findOne({ _id: EMAIL as never })).toMatchObject({
      semester: 6,
      semesterSource: 'student',
      version: 3
    });
  });
});
