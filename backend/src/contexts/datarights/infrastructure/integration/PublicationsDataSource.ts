import type { ForumAuthorRepositoryPort } from '../../../forum/domain/ports/out/ForumAuthorRepositoryPort.js';
import type { PostRepositoryPort } from '../../../forum/domain/ports/out/PostRepositoryPort.js';
import type { PersonalDataRecord } from '../../domain/entities/PersonalDataArea.js';
import type { PersonalDataSourcePort } from '../../domain/ports/out/PersonalDataSourcePort.js';

/**
 * Publicaciones del foro (HU-30) y la firma con que se hicieron (nombre y
 * programa del directorio, que solo el foro conserva). Las infracciones y
 * sanciones no se listan ni se borran aqui: se disocian (HU-48 criterio 5).
 */
export class PublicationsDataSource implements PersonalDataSourcePort {
  readonly area = 'publications' as const;

  constructor(
    private readonly posts: PostRepositoryPort,
    private readonly authors: ForumAuthorRepositoryPort
  ) {}

  async collect(subject: string): Promise<readonly PersonalDataRecord[]> {
    const author = await this.authors.findByEmail(subject);
    const posts = await this.posts.findByAuthor(subject);
    return [
      ...(author === null
        ? []
        : [{ kind: 'author-signature', name: author.name, program: author.programName, syncedAt: author.syncedAt }]),
      ...posts.map((post) => ({
        kind: 'post',
        id: post.id,
        topicId: post.topicId,
        title: post.title,
        text: post.text,
        publishedAt: post.publishedAt
      }))
    ];
  }

  async erase(subject: string): Promise<number> {
    const removedPosts = await this.posts.deleteByAuthor(subject);
    const removedAuthor = await this.authors.delete(subject);
    return removedPosts + (removedAuthor ? 1 : 0);
  }
}
