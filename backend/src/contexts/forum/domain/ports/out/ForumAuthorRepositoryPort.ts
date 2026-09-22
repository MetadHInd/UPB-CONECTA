import type { ForumAuthor } from '../../entities/ForumAuthor.js';

export interface ForumAuthorRepositoryPort {
  /** `email` ya normalizado. */
  findByEmail(email: string): Promise<ForumAuthor | null>;
  /** Reemplaza el autor con lo que trae el directorio en el ultimo login. */
  save(author: ForumAuthor): Promise<void>;
}
