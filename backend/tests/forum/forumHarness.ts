import { HandleModerationDecision } from '../../src/contexts/moderation/application/HandleModerationDecision.js';
import { parseModerationFeedbackConfig } from '../../src/contexts/moderation/domain/value-objects/ModerationFeedbackConfig.js';
import { InMemoryAuthorFeedbackNotices } from '../../src/contexts/moderation/infrastructure/adapters/out/memory/InMemoryAuthorFeedbackNotices.js';
import { InMemoryContentModerationLog } from '../../src/contexts/moderation/infrastructure/adapters/out/memory/InMemoryContentModerationLog.js';
import { InMemoryRetainedContentQueue } from '../../src/contexts/moderation/infrastructure/adapters/out/memory/InMemoryRetainedContentQueue.js';
import { CreatePost } from '../../src/contexts/forum/application/CreatePost.js';
import { GetModerationHistory } from '../../src/contexts/forum/application/GetModerationHistory.js';
import { ListTopicPosts } from '../../src/contexts/forum/application/ListTopicPosts.js';
import { ListTopics } from '../../src/contexts/forum/application/ListTopics.js';
import { ManageTopics } from '../../src/contexts/forum/application/ManageTopics.js';
import { ManageSanctionThresholds } from '../../src/contexts/forum/application/ManageSanctionThresholds.js';
import { RecordInfraction } from '../../src/contexts/forum/application/RecordInfraction.js';
import { RevokeSanction } from '../../src/contexts/forum/application/RevokeSanction.js';
import { SeedDefaultTopics } from '../../src/contexts/forum/application/SeedDefaultTopics.js';
import { SyncForumAuthor } from '../../src/contexts/forum/application/SyncForumAuthor.js';
import { SanctionLevel } from '../../src/contexts/forum/domain/entities/Sanction.js';
import type { ForumAuthorRepositoryPort } from '../../src/contexts/forum/domain/ports/out/ForumAuthorRepositoryPort.js';
import type { PostRepositoryPort } from '../../src/contexts/forum/domain/ports/out/PostRepositoryPort.js';
import type { HeldContentStorePort } from '../../src/contexts/moderation/domain/ports/out/HeldContentStorePort.js';
import type { InfractionRepositoryPort } from '../../src/contexts/forum/domain/ports/out/InfractionRepositoryPort.js';
import type { SanctionRepositoryPort } from '../../src/contexts/forum/domain/ports/out/SanctionRepositoryPort.js';
import type { SanctionThresholdsRepositoryPort } from '../../src/contexts/forum/domain/ports/out/SanctionThresholdsRepositoryPort.js';
import type { TopicRepositoryPort } from '../../src/contexts/forum/domain/ports/out/TopicRepositoryPort.js';
import { RandomForumIdGenerator } from '../../src/contexts/forum/infrastructure/adapters/out/crypto/RandomForumIdGenerator.js';
import { InMemoryForumAccessAuditLog } from '../../src/contexts/forum/infrastructure/adapters/out/memory/InMemoryForumAccessAuditLog.js';
import { InMemoryForumAuthorRepository } from '../../src/contexts/forum/infrastructure/adapters/out/memory/InMemoryForumAuthorRepository.js';
import { InMemoryPostRepository } from '../../src/contexts/forum/infrastructure/adapters/out/memory/InMemoryPostRepository.js';
import { InMemoryInfractionRepository } from '../../src/contexts/forum/infrastructure/adapters/out/memory/InMemoryInfractionRepository.js';
import { InMemorySanctionAuditLog } from '../../src/contexts/forum/infrastructure/adapters/out/memory/InMemorySanctionAuditLog.js';
import { InMemorySanctionNotifications } from '../../src/contexts/forum/infrastructure/adapters/out/memory/InMemorySanctionNotifications.js';
import { InMemorySanctionRepository } from '../../src/contexts/forum/infrastructure/adapters/out/memory/InMemorySanctionRepository.js';
import { InMemorySanctionThresholdsRepository } from '../../src/contexts/forum/infrastructure/adapters/out/memory/InMemorySanctionThresholdsRepository.js';
import { InMemoryTopicRepository } from '../../src/contexts/forum/infrastructure/adapters/out/memory/InMemoryTopicRepository.js';
import { IdentityForumAuthorSyncAdapter } from '../../src/contexts/forum/infrastructure/integration/IdentityForumAuthorSyncAdapter.js';
import { DEFAULT_FORUM_TOPICS } from '../../src/contexts/forum/infrastructure/seed/defaultForumTopics.js';
import { FanOutProfileSync } from '../../src/contexts/identity/infrastructure/adapters/out/profile-sync/FanOutProfileSync.js';
import type { InstitutionalProgramCatalog } from '../../src/contexts/targeting/domain/ports/out/ProgramCatalogPort.js';
import { FacultyProgramResolver } from '../../src/contexts/targeting/domain/services/FacultyProgramResolver.js';
import { ProgramCatalogMatcher } from '../../src/contexts/targeting/domain/services/ProgramCatalogMatcher.js';
import { buildSessionHarness } from '../identity/sessionHarness.js';
import { ScreenContent } from '../../src/contexts/moderation/application/ScreenContent.js';
import { ModerationThresholds } from '../../src/contexts/moderation/domain/value-objects/ModerationThresholds.js';
import { InMemoryHeldContentStore } from '../../src/contexts/moderation/infrastructure/adapters/out/memory/InMemoryHeldContentStore.js';
import { ScriptedModerationPort } from '../moderation/ScriptedModerationPort.js';

export const FORUM_CATALOG: InstitutionalProgramCatalog = {
  faculties: [
    { id: 'ingenieria', name: 'Facultad de Ingeniería', programIds: ['sistemas', 'industrial'] },
    { id: 'humanidades', name: 'Facultad de Humanidades', programIds: ['psicologia'] }
  ],
  programs: [
    { id: 'sistemas', name: 'Ingeniería de Sistemas', facultyId: 'ingenieria' },
    { id: 'industrial', name: 'Ingeniería Industrial', facultyId: 'ingenieria' },
    { id: 'psicologia', name: 'Psicología', facultyId: 'humanidades' }
  ]
};

export const PASSWORD = 'S3cr3t!UPB';
export const STUDENTS = {
  ana: { name: 'Ana Gómez', email: 'ana@upb.edu.co', program: 'Ingeniería de Sistemas', semester: 5, studentId: '2024-0001' },
  luis: { name: 'Luis Pérez', email: 'luis@upb.edu.co', program: 'Psicología', semester: 3, studentId: '2024-0002' },
  eva: { name: 'Eva Ruiz', email: 'eva@upb.edu.co', program: 'Astrofísica', semester: 2, studentId: '2024-0003' }
} as const;
export type StudentKey = keyof typeof STUDENTS;

/**
 * Cablea identidad (HU-43/45) + foro (HU-30): el login sincroniza el autor
 * verificado del foro a través del puerto de identidad, como en producción.
 */
export function buildForumHarness(
  options: {
    readonly topics?: TopicRepositoryPort;
    readonly posts?: PostRepositoryPort;
    readonly authors?: ForumAuthorRepositoryPort;
    readonly infractions?: InfractionRepositoryPort;
    readonly sanctions?: SanctionRepositoryPort;
    readonly thresholds?: SanctionThresholdsRepositoryPort;
    readonly retainedQueue?: HeldContentStorePort;
  } = {}
) {
  let now = new Date('2026-09-22T12:00:00Z');
  const clock = { now: () => now };
  const topics = options.topics ?? new InMemoryTopicRepository();
  const posts = options.posts ?? new InMemoryPostRepository();
  const authors = options.authors ?? new InMemoryForumAuthorRepository();
  const audit = new InMemoryForumAccessAuditLog();
  const infractions = options.infractions ?? new InMemoryInfractionRepository();
  const sanctions = options.sanctions ?? new InMemorySanctionRepository();
  const thresholds = options.thresholds ?? new InMemorySanctionThresholdsRepository();
  const sanctionAudit = new InMemorySanctionAuditLog();
  const notifications = new InMemorySanctionNotifications();
  const ids = new RandomForumIdGenerator();
  // HU-31: por defecto el servicio de moderación responde un puntaje limpio; cada prueba lo cambia con `moderationPort.script`.
  const moderationPort = new ScriptedModerationPort({ score: 0.05 });
  const reviewQueue = options.retainedQueue ?? new InMemoryHeldContentStore();
  const moderate = new ScreenContent({
    moderation: moderationPort,
    policy: { thresholds: ModerationThresholds.of(0.4, 0.8), bannedTerms: ['idiota', 'hijo de puta'], timeoutMs: 100 }
  });
  const faculties = new FacultyProgramResolver(FORUM_CATALOG);
  const syncAuthor = new SyncForumAuthor({ authors, clock, programs: new ProgramCatalogMatcher(FORUM_CATALOG) });
  const identity = buildSessionHarness({
    profileSync: new FanOutProfileSync([new IdentityForumAuthorSyncAdapter(syncAuthor)])
  });
  for (const profile of Object.values(STUDENTS)) {
    identity.provider.register({ username: profile.email, password: PASSWORD, profile });
  }

  const retentionQueue = new InMemoryRetainedContentQueue();
  const moderationLog = new InMemoryContentModerationLog();
  const authorNotices = new InMemoryAuthorFeedbackNotices();
  const decisions = new HandleModerationDecision({
    config: parseModerationFeedbackConfig({
      resolutionDeadlineHours: 24,
      norms: [{ category: 'other', code: 'NC-07', title: 'Convivencia general', text: 'El contenido incumple las normas generales de convivencia.' }]
    }),
    queue: retentionQueue,
    log: moderationLog,
    notifications: authorNotices,
    clock
  });
  const recordInfraction = new RecordInfraction({ infractions, sanctions, thresholds, notifications, audit: sanctionAudit, clock, ids });

  return {
    moderationPort,
    reviewQueue,
    decisions,
    moderationLog,
    authorNotices,
    retentionQueue,
    topics,
    posts,
    authors,
    audit,
    infractions,
    sanctions,
    thresholds,
    sanctionAudit,
    notifications,
    identity,
    now: () => now,
    advanceHours(hours: number) {
      now = new Date(now.getTime() + hours * 3_600_000);
    },
    async login(student: StudentKey) {
      const result = await identity.authenticate.execute({ username: STUDENTS[student].email, password: PASSWORD, origin: '10.0.0.1' });
      if (!result.ok) throw new Error(`login fallido: ${result.message}`);
      return result;
    },
    /** Sancion directa, para preparar casos de HU-30 sin pasar por el historial de infracciones. */
    async imposeSanction(email: string, period: { readonly startsAt: Date; readonly endsAt: Date }) {
      await sanctions.save({
        id: ids.newId(),
        studentEmail: email,
        level: SanctionLevel.TEMPORARY_SUSPENSION,
        reason: 'Sanción de prueba',
        ...period,
        revokedAt: null,
        infractionCount: 3,
        triggeredByInfractionId: `post:${ids.newId()}`,
        imposedAt: period.startsAt,
        revocation: null
      });
    },
    changeDirectory(student: StudentKey, changes: { readonly name?: string; readonly program?: string; readonly semester?: number }) {
      identity.provider.register({ username: STUDENTS[student].email, password: PASSWORD, profile: { ...STUDENTS[student], ...changes } });
    },
    seed: new SeedDefaultTopics({ topics, clock }),
    seedTopics: DEFAULT_FORUM_TOPICS,
    manage: new ManageTopics({ topics, clock, catalog: FORUM_CATALOG }),
    createPost: new CreatePost({ topics, posts, authors, sanctions, audit, clock, ids, faculties, moderate, reviewQueue, recordInfraction, decisions }),
    listTopics: new ListTopics({ topics, authors, faculties }),
    listPosts: new ListTopicPosts({ topics, posts, authors, audit, clock, faculties }),
    recordInfraction,
    history: new GetModerationHistory({ infractions, sanctions, thresholds, clock }),
    revokeSanction: new RevokeSanction({ sanctions, notifications, audit: sanctionAudit, clock }),
    manageThresholds: new ManageSanctionThresholds({ thresholds, audit: sanctionAudit, clock })
  };
}
