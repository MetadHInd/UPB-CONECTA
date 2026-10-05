import { CreatePost } from '../../src/contexts/forum/application/CreatePost.js';
import { ListTopicPosts } from '../../src/contexts/forum/application/ListTopicPosts.js';
import { ListTopics } from '../../src/contexts/forum/application/ListTopics.js';
import { ManageTopics } from '../../src/contexts/forum/application/ManageTopics.js';
import { SeedDefaultTopics } from '../../src/contexts/forum/application/SeedDefaultTopics.js';
import { SyncForumAuthor } from '../../src/contexts/forum/application/SyncForumAuthor.js';
import type { ForumAuthorRepositoryPort } from '../../src/contexts/forum/domain/ports/out/ForumAuthorRepositoryPort.js';
import type { PostRepositoryPort } from '../../src/contexts/forum/domain/ports/out/PostRepositoryPort.js';
import type { TopicRepositoryPort } from '../../src/contexts/forum/domain/ports/out/TopicRepositoryPort.js';
import { RandomForumIdGenerator } from '../../src/contexts/forum/infrastructure/adapters/out/crypto/RandomForumIdGenerator.js';
import { InMemoryForumAccessAuditLog } from '../../src/contexts/forum/infrastructure/adapters/out/memory/InMemoryForumAccessAuditLog.js';
import { InMemoryForumAuthorRepository } from '../../src/contexts/forum/infrastructure/adapters/out/memory/InMemoryForumAuthorRepository.js';
import { InMemoryPostRepository } from '../../src/contexts/forum/infrastructure/adapters/out/memory/InMemoryPostRepository.js';
import { InMemorySanctionStatus } from '../../src/contexts/forum/infrastructure/adapters/out/memory/InMemorySanctionStatus.js';
import { InMemoryTopicRepository } from '../../src/contexts/forum/infrastructure/adapters/out/memory/InMemoryTopicRepository.js';
import { IdentityForumAuthorSyncAdapter } from '../../src/contexts/forum/infrastructure/integration/IdentityForumAuthorSyncAdapter.js';
import { DEFAULT_FORUM_TOPICS } from '../../src/contexts/forum/infrastructure/seed/defaultForumTopics.js';
import { FanOutProfileSync } from '../../src/contexts/identity/infrastructure/adapters/out/profile-sync/FanOutProfileSync.js';
import type { InstitutionalProgramCatalog } from '../../src/contexts/targeting/domain/ports/out/ProgramCatalogPort.js';
import { FacultyProgramResolver } from '../../src/contexts/targeting/domain/services/FacultyProgramResolver.js';
import { ProgramCatalogMatcher } from '../../src/contexts/targeting/domain/services/ProgramCatalogMatcher.js';
import { buildSessionHarness } from '../identity/sessionHarness.js';

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
  options: { readonly topics?: TopicRepositoryPort; readonly posts?: PostRepositoryPort; readonly authors?: ForumAuthorRepositoryPort } = {}
) {
  let now = new Date('2026-09-22T12:00:00Z');
  const clock = { now: () => now };
  const topics = options.topics ?? new InMemoryTopicRepository();
  const posts = options.posts ?? new InMemoryPostRepository();
  const authors = options.authors ?? new InMemoryForumAuthorRepository();
  const audit = new InMemoryForumAccessAuditLog();
  const sanctions = new InMemorySanctionStatus();
  const ids = new RandomForumIdGenerator();
  const faculties = new FacultyProgramResolver(FORUM_CATALOG);
  const syncAuthor = new SyncForumAuthor({ authors, clock, programs: new ProgramCatalogMatcher(FORUM_CATALOG) });
  const identity = buildSessionHarness({
    profileSync: new FanOutProfileSync([new IdentityForumAuthorSyncAdapter(syncAuthor)])
  });
  for (const profile of Object.values(STUDENTS)) {
    identity.provider.register({ username: profile.email, password: PASSWORD, profile });
  }

  return {
    topics,
    posts,
    authors,
    audit,
    sanctions,
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
    changeDirectory(student: StudentKey, changes: { readonly name?: string; readonly program?: string; readonly semester?: number }) {
      identity.provider.register({ username: STUDENTS[student].email, password: PASSWORD, profile: { ...STUDENTS[student], ...changes } });
    },
    seed: new SeedDefaultTopics({ topics, clock }),
    seedTopics: DEFAULT_FORUM_TOPICS,
    manage: new ManageTopics({ topics, clock, catalog: FORUM_CATALOG }),
    createPost: new CreatePost({ topics, posts, authors, sanctions, audit, clock, ids, faculties }),
    listTopics: new ListTopics({ topics, authors, faculties }),
    listPosts: new ListTopicPosts({ topics, posts, authors, audit, clock, faculties })
  };
}
