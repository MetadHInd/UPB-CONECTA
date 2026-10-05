import { GetSegmentedFeed } from '../../src/contexts/feed/application/GetSegmentedFeed.js';
import { GetStudentFeed } from '../../src/contexts/feed/application/GetStudentFeed.js';
import type { ConvocatoriaEntry, ConvocatoriaRepositoryPort } from '../../src/contexts/feed/domain/ports/out/ConvocatoriaRepositoryPort.js';
import { SyncStudentProfileFromDirectory } from '../../src/contexts/profile/application/SyncStudentProfileFromDirectory.js';
import { UpdateStudentProfile } from '../../src/contexts/profile/application/UpdateStudentProfile.js';
import { ViewStudentProfile } from '../../src/contexts/profile/application/ViewStudentProfile.js';
import type { StudentProfileRepositoryPort } from '../../src/contexts/profile/domain/ports/out/StudentProfileRepositoryPort.js';
import { createSemesterBounds } from '../../src/contexts/profile/domain/value-objects/SemesterNumber.js';
import { InMemoryStudentProfileRepository } from '../../src/contexts/profile/infrastructure/adapters/out/memory/InMemoryStudentProfileRepository.js';
import { TargetingProgramCatalogAdapter } from '../../src/contexts/profile/infrastructure/integration/TargetingProgramCatalogAdapter.js';
import { FeedStudentSegmentAdapter } from '../../src/contexts/profile/infrastructure/integration/FeedStudentSegmentAdapter.js';
import { IdentityProfileSyncAdapter } from '../../src/contexts/profile/infrastructure/integration/IdentityProfileSyncAdapter.js';
import { FacultyProgramResolver } from '../../src/contexts/targeting/domain/services/FacultyProgramResolver.js';
import type { InstitutionalProgramCatalog } from '../../src/contexts/targeting/domain/ports/out/ProgramCatalogPort.js';
import type { ProgramTargetingRecord } from '../../src/contexts/targeting/domain/ports/out/ProgramTargetingRepositoryPort.js';
import { InMemoryProgramTargetingRepository } from '../../src/contexts/targeting/infrastructure/adapters/out/memory/InMemoryProgramTargetingRepository.js';
import { buildSessionHarness, STUDENT } from '../identity/sessionHarness.js';

export const CATALOG: InstitutionalProgramCatalog = {
  faculties: [{ id: 'ingenieria', name: 'Facultad de Ingeniería', programIds: ['sistemas', 'industrial'] }],
  programs: [
    { id: 'sistemas', name: 'Ingeniería de Sistemas', facultyId: 'ingenieria' },
    { id: 'industrial', name: 'Ingeniería Industrial', facultyId: 'ingenieria' }
  ]
};

export const DIRECTORY_PROFILE = {
  name: 'Ana Gómez',
  email: 'estudiante@upb.edu.co',
  program: 'sistemas',
  semester: 5,
  studentId: '2024-0001'
};

class FixedConvocatorias implements ConvocatoriaRepositoryPort {
  readonly entries: ConvocatoriaEntry[] = [];

  async findSegmentedFeed(): Promise<ConvocatoriaEntry[]> {
    return this.entries;
  }
}

/**
 * Cablea identidad (HU-43/45) + perfil (HU-37) + feed (HU-12) como lo hará la
 * composición real: el login sincroniza el perfil por el puerto de identidad,
 * y el feed obtiene el segmento del perfil persistido por el puerto de feed.
 */
export function buildProfileHarness(options: { readonly profiles?: StudentProfileRepositoryPort; readonly maxSemester?: number } = {}) {
  const profiles = options.profiles ?? new InMemoryStudentProfileRepository();
  const bounds = createSemesterBounds(options.maxSemester ?? 12);
  let now = new Date('2026-09-22T12:00:00Z');
  const clock = { now: () => now };
  // Copia mutable por prueba: algunas pruebas agregan o quitan programas.
  const catalog = structuredClone(CATALOG) as { faculties: InstitutionalProgramCatalog['faculties']; programs: InstitutionalProgramCatalog['programs'] };
  const programs = new TargetingProgramCatalogAdapter(catalog);
  const sync = new SyncStudentProfileFromDirectory({ profiles, clock, bounds, programs });
  const identity = buildSessionHarness({ profileSync: new IdentityProfileSyncAdapter(sync) });
  identity.provider.register({ username: STUDENT.username, password: STUDENT.password, profile: DIRECTORY_PROFILE });

  const targeting = new InMemoryProgramTargetingRepository();
  const convocatorias = new FixedConvocatorias();
  const segmentedFeed = new GetSegmentedFeed({
    convocatoriaRepo: convocatorias,
    programTargetingRepo: targeting,
    facultyResolver: new FacultyProgramResolver(catalog)
  });

  return {
    profiles,
    bounds,
    catalog,
    identity,
    sync,
    advanceDays(days: number) {
      now = new Date(now.getTime() + days * 86_400_000);
    },
    now: () => now,
    view: new ViewStudentProfile({ profiles, bounds, programs }),
    update: new UpdateStudentProfile({ profiles, clock, bounds }),
    feed: new GetStudentFeed({ segments: new FeedStudentSegmentAdapter(profiles), feed: segmentedFeed }),
    async login() {
      const result = await identity.authenticate.execute({ ...STUDENT, origin: '10.0.0.1' });
      if (!result.ok) throw new Error(`login fallido: ${result.message}`);
      return result;
    },
    changeDirectory(profile: Partial<typeof DIRECTORY_PROFILE>) {
      identity.provider.register({ ...STUDENT, profile: { ...DIRECTORY_PROFILE, ...profile } });
    },
    async publish(id: string, record: Omit<ProgramTargetingRecord, 'messageId' | 'persistedAt'>) {
      await targeting.save({ messageId: `m-${id}`, persistedAt: now, ...record });
      convocatorias.entries.push({ id, record: { representativeMessageId: `m-${id}` } as ConvocatoriaEntry['record'] });
    },
    async visibleFeedIds(email = DIRECTORY_PROFILE.email) {
      return (await this.feed.execute(email)).feed.map((entry) => entry.id);
    }
  };
}
