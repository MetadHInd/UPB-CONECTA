import type { FacultyProgramResolver } from '../../targeting/domain/services/FacultyProgramResolver.js';
import { isVerifiedAuthor, normalizeForumEmail } from '../domain/entities/ForumAuthor.js';
import { toPostView, type PostView } from '../domain/entities/Post.js';
import { ForumAccessPolicy } from '../domain/services/ForumAccessPolicy.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { ForumAccessAuditPort } from '../domain/ports/out/ForumAccessAuditPort.js';
import type { ForumAuthorRepositoryPort } from '../domain/ports/out/ForumAuthorRepositoryPort.js';
import type { PostRepositoryPort } from '../domain/ports/out/PostRepositoryPort.js';
import type { TopicRepositoryPort } from '../domain/ports/out/TopicRepositoryPort.js';

export type ListTopicPostsResult =
  | { readonly ok: true; readonly posts: readonly PostView[] }
  | { readonly ok: false; readonly error: 'author-not-verified' | 'topic-not-found' | 'topic-restricted'; readonly message: string };

/**
 * Leer un tema (HU-30 criterio 4): "acceder" a un tema restringido incluye
 * leerlo, no solo publicar. Un intento de otro programa se rechaza y se
 * audita igual que al publicar. Una sancion no impide leer.
 */
export class ListTopicPosts {
  private readonly policy: ForumAccessPolicy;

  constructor(
    private readonly dependencies: {
      readonly topics: TopicRepositoryPort;
      readonly posts: PostRepositoryPort;
      readonly authors: ForumAuthorRepositoryPort;
      readonly audit: ForumAccessAuditPort;
      readonly clock: ClockPort;
      readonly faculties: FacultyProgramResolver;
    }
  ) {
    this.policy = new ForumAccessPolicy(dependencies.faculties);
  }

  async execute(input: { readonly viewerEmail: string; readonly topicId: string }): Promise<ListTopicPostsResult> {
    const { topics, posts, authors, audit, clock } = this.dependencies;
    const email = normalizeForumEmail(input.viewerEmail);
    const [author, topic] = await Promise.all([authors.findByEmail(email), topics.findById(input.topicId)]);

    if (!isVerifiedAuthor(author)) {
      return { ok: false, error: 'author-not-verified', message: 'Inicia sesión para verificar tu identidad con el directorio.' };
    }
    const access = this.policy.checkTopicAccess(topic, author);
    if (!access.allowed) {
      if (access.reason === 'topic-restricted') {
        await audit.record({
          kind: 'topic-access-denied',
          operation: 'read',
          studentEmail: email,
          studentProgramId: author.programId,
          topicId: input.topicId,
          occurredAt: clock.now()
        });
        return { ok: false, error: 'topic-restricted', message: 'Este tema está restringido a otros programas.' };
      }
      return { ok: false, error: 'topic-not-found', message: 'El tema no existe o fue retirado.' };
    }

    return { ok: true, posts: (await posts.findByTopic(input.topicId)).map(toPostView) };
  }
}
