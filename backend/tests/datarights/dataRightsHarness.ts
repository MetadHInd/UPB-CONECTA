import { EndAllSessionsForSubject } from '../../src/contexts/identity/application/EndAllSessionsForSubject.js';
import { InMemoryRefreshTokenRepository } from '../../src/contexts/identity/infrastructure/adapters/out/memory/InMemoryRefreshTokenRepository.js';
import { IdentitySessionRevocation } from '../../src/contexts/datarights/infrastructure/integration/IdentitySessionRevocation.js';
import { ArchiveExpiredConvocatorias } from '../../src/contexts/datarights/application/ArchiveExpiredConvocatorias.js';
import { ErasureExecutor } from '../../src/contexts/datarights/application/ErasureExecutor.js';
import { GetPersonalDataReport } from '../../src/contexts/datarights/application/GetPersonalDataReport.js';
import { ProcessPendingErasures } from '../../src/contexts/datarights/application/ProcessPendingErasures.js';
import { RectifyPersonalData } from '../../src/contexts/datarights/application/RectifyPersonalData.js';
import { RequestPersonalDataErasure } from '../../src/contexts/datarights/application/RequestPersonalDataErasure.js';
import type { PersonalDataSourcePort } from '../../src/contexts/datarights/domain/ports/out/PersonalDataSourcePort.js';
import type { ArchivableConvocatoria, ConvocatoriaSourcePort } from '../../src/contexts/datarights/domain/ports/out/ConvocatoriaArchivePorts.js';
import { RandomIdentifierGenerator } from '../../src/contexts/datarights/infrastructure/adapters/out/crypto/RandomIdentifierGenerator.js';
import { InMemoryConvocatoriaArchive } from '../../src/contexts/datarights/infrastructure/adapters/out/memory/InMemoryConvocatoriaArchive.js';
import { InMemoryErasureRequestRepository } from '../../src/contexts/datarights/infrastructure/adapters/out/memory/InMemoryErasureRequestRepository.js';
import { InMemoryRectificationLog } from '../../src/contexts/datarights/infrastructure/adapters/out/memory/InMemoryRectificationLog.js';
import { loadRetentionPolicy } from '../../src/contexts/datarights/infrastructure/config/JsonRetentionPolicy.js';
import { ApplicationTrackingDataSource } from '../../src/contexts/datarights/infrastructure/integration/ApplicationTrackingDataSource.js';
import { DevicesDataSource } from '../../src/contexts/datarights/infrastructure/integration/DevicesDataSource.js';
import { InMemoryForumModerationDissociation } from '../../src/contexts/datarights/infrastructure/integration/ForumModerationDissociation.js';
import { PreferencesDataSource } from '../../src/contexts/datarights/infrastructure/integration/PreferencesDataSource.js';
import { ProfileDataSource } from '../../src/contexts/datarights/infrastructure/integration/ProfileDataSource.js';
import { PublicationsDataSource } from '../../src/contexts/datarights/infrastructure/integration/PublicationsDataSource.js';
import { StudentProfileRectificationAdapter } from '../../src/contexts/datarights/infrastructure/integration/StudentProfileRectificationAdapter.js';
import { InfractionOutcome } from '../../src/contexts/forum/domain/entities/Infraction.js';
import { InMemoryDeviceRegistry } from '../../src/contexts/notifications/infrastructure/adapters/out/memory/InMemoryDeviceRegistry.js';
import { InMemoryNotificationPreferencesRepository } from '../../src/contexts/notifications/infrastructure/adapters/out/memory/InMemoryNotificationPreferencesRepository.js';
import { InMemoryPersonalStateRepository } from '../../src/contexts/personalization/infrastructure/adapters/out/memory/InMemoryPersonalStateRepository.js';
import { InMemoryPracticeApplicationTrackingRepository } from '../../src/contexts/practices/infrastructure/adapters/out/memory/InMemoryPracticeApplicationTrackingRepository.js';
import { UpdateStudentProfile } from '../../src/contexts/profile/application/UpdateStudentProfile.js';
import { StudentProfile } from '../../src/contexts/profile/domain/entities/StudentProfile.js';
import { createSemesterBounds } from '../../src/contexts/profile/domain/value-objects/SemesterNumber.js';
import { InMemoryStudentProfileRepository } from '../../src/contexts/profile/infrastructure/adapters/out/memory/InMemoryStudentProfileRepository.js';
import { buildForumHarness } from '../forum/forumHarness.js';

export const ANA = 'ana@upb.edu.co';
export const LUIS = 'luis@upb.edu.co';

class FixedConvocatorias implements ConvocatoriaSourcePort {
  candidates: ArchivableConvocatoria[] = [];
  async findWithDueDate(): Promise<readonly ArchivableConvocatoria[]> {
    return this.candidates;
  }
}

/** Fuente que falla mientras `failing` sea verdadero: simula un contexto caido durante la supresion. */
export class FlakySource implements PersonalDataSourcePort {
  failing = true;
  constructor(private readonly inner: PersonalDataSourcePort) {}
  get area() {
    return this.inner.area;
  }
  collect(subject: string) {
    return this.inner.collect(subject);
  }
  async erase(subject: string): Promise<number> {
    if (this.failing) throw new Error(`${this.inner.area} no disponible`);
    return this.inner.erase(subject);
  }
}

export function buildDataRightsHarness(options: { readonly flaky?: 'devices' | 'publications' } = {}) {
  const forum = buildForumHarness();
  const policy = loadRetentionPolicy();
  const bounds = createSemesterBounds(12);
  let now = new Date('2026-09-22T12:00:00Z');
  const clock = { now: () => now };

  const profiles = new InMemoryStudentProfileRepository();
  const preferences = new InMemoryNotificationPreferencesRepository();
  const states = new InMemoryPersonalStateRepository();
  const practiceTrackings = new InMemoryPracticeApplicationTrackingRepository();
  const devices = new InMemoryDeviceRegistry();
  const requests = new InMemoryErasureRequestRepository();
  const rectifications = new InMemoryRectificationLog();
  const archive = new InMemoryConvocatoriaArchive();
  const convocatorias = new FixedConvocatorias();
  const ids = new RandomIdentifierGenerator();

  const baseSources = {
    profile: new ProfileDataSource(profiles),
    preferences: new PreferencesDataSource(preferences),
    publications: new PublicationsDataSource(forum.posts, forum.authors),
    applicationTracking: new ApplicationTrackingDataSource(states, practiceTrackings),
    devices: new DevicesDataSource(devices)
  };
  const flaky = options.flaky === undefined ? null : new FlakySource(baseSources[options.flaky]);
  const sources: PersonalDataSourcePort[] = Object.values(baseSources).map((source) => (flaky !== null && source.area === flaky.area ? flaky : source));

  const moderation = new InMemoryForumModerationDissociation({
    infractions: forum.infractions,
    sanctions: forum.sanctions,
    sanctionAudit: forum.sanctionAudit
  });
  const refreshTokens = new InMemoryRefreshTokenRepository();
  const sessions = new IdentitySessionRevocation(new EndAllSessionsForSubject({ refreshTokens, clock }));
  const executor = new ErasureExecutor({ sources, rectifications, moderation, sessions, requests, ids, clock });

  return {
    forum,
    policy,
    profiles,
    preferences,
    states,
    practiceTrackings,
    devices,
    refreshTokens,
    requests,
    rectifications,
    archive,
    convocatorias,
    sources,
    flaky,
    moderation,
    now: () => now,
    advanceDays(days: number) {
      now = new Date(now.getTime() + days * 86_400_000);
    },
    report: new GetPersonalDataReport({ sources, rectifications, policy, clock }),
    rectify: new RectifyPersonalData({
      profile: new StudentProfileRectificationAdapter({ profiles, update: new UpdateStudentProfile({ profiles, clock, bounds }) }),
      log: rectifications,
      policy,
      clock
    }),
    erase: new RequestPersonalDataErasure({ executor, requests, ids, policy, clock }),
    processPending: new ProcessPendingErasures({ executor, requests, clock }),
    archiveExpired: new ArchiveExpiredConvocatorias({ source: convocatorias, archive, policy, clock }),

    /** Todo lo que el sistema puede tener de un estudiante: perfil, preferencias, seguimiento, dispositivo, publicaciones y moderacion. */
    async populate(email: string) {
      await profiles.save(
        StudentProfile.fromDirectory({ name: 'Ana Gómez', email, program: 'sistemas', semester: 5 }, 'sistemas', bounds, now)
      );
      await preferences.save({ studentId: email, categoryPreferences: { beca: false }, leadTimeMinutes: 180, theme: 'dark', updatedAt: now });
      await states.save({ studentId: email, convocatoriaId: 'c-1', read: true, saved: true, archived: false, updatedAt: now });
      await states.save({ studentId: email, convocatoriaId: 'c-2', read: true, saved: false, archived: true, updatedAt: now });
      await devices.register(email, 'token-abcdef123456', now);
      await forum.seed.execute(forum.seedTopics);
      await forum.authors.save({ email, name: 'Ana Gómez', programName: 'Ingeniería de Sistemas', programId: 'sistemas', syncedAt: now });
      const post = await forum.createPost.execute({ authorEmail: email, topicId: 'general', body: { title: 'Hola', text: 'Mi primera publicación.' } });
      if (!post.ok) throw new Error(`no se pudo publicar: ${JSON.stringify(post)}`);
      await forum.recordInfraction.execute({
        studentEmail: email,
        content: { kind: 'post', id: `p-bad-${email.length}${email.charCodeAt(0)}`, topicId: 'general', title: 'Ofensivo', text: 'Contenido bloqueado' },
        outcome: InfractionOutcome.BLOCKED,
        reason: 'Lenguaje ofensivo',
        detectedBy: 'automatic-moderation'
      });
    }
  };
}

export type DataRightsHarness = ReturnType<typeof buildDataRightsHarness>;
