import type { FacultyProgramResolver } from '../../targeting/domain/services/FacultyProgramResolver.js';
import { normalizeForumEmail } from '../domain/entities/ForumAuthor.js';
import { isTopicRestricted } from '../domain/entities/Topic.js';
import { ForumAccessPolicy } from '../domain/services/ForumAccessPolicy.js';
import type { ForumAuthorRepositoryPort } from '../domain/ports/out/ForumAuthorRepositoryPort.js';
import type { TopicRepositoryPort } from '../domain/ports/out/TopicRepositoryPort.js';

export interface TopicSummary {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly restricted: boolean;
}

/**
 * Temas que el estudiante encuentra al navegar (HU-30 criterio 3): los activos
 * a los que tiene acceso, leidos del repositorio en cada llamada. Omitir un
 * tema restringido del listado es comodidad, no control de acceso: leer o
 * publicar vuelven a verificar el acceso en el servidor.
 */
export class ListTopics {
  private readonly policy: ForumAccessPolicy;

  constructor(
    private readonly dependencies: {
      readonly topics: TopicRepositoryPort;
      readonly authors: ForumAuthorRepositoryPort;
      readonly faculties: FacultyProgramResolver;
    }
  ) {
    this.policy = new ForumAccessPolicy(dependencies.faculties);
  }

  async execute(viewerEmail: string): Promise<readonly TopicSummary[]> {
    const email = normalizeForumEmail(viewerEmail);
    const [topics, author] = await Promise.all([
      this.dependencies.topics.findActive(),
      this.dependencies.authors.findByEmail(email)
    ]);
    // Sin autor sincronizado, solo se ven los temas abiertos a toda la comunidad.
    const viewer = author ?? { email, name: '', programName: '', programId: null, syncedAt: new Date(0) };
    return topics
      .filter((topic) => this.policy.checkTopicAccess(topic, viewer).allowed)
      .map((topic) => ({ id: topic.id, name: topic.name, description: topic.description, restricted: isTopicRestricted(topic) }));
  }
}
