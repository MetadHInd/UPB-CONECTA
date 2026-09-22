import type { ForumAuthor } from '../../../../domain/entities/ForumAuthor.js';
import type { ForumAuthorRepositoryPort } from '../../../../domain/ports/out/ForumAuthorRepositoryPort.js';

export class InMemoryForumAuthorRepository implements ForumAuthorRepositoryPort {
  private readonly authors = new Map<string, ForumAuthor>();

  async findByEmail(email: string): Promise<ForumAuthor | null> {
    return this.authors.get(email) ?? null;
  }

  async save(author: ForumAuthor): Promise<void> {
    this.authors.set(author.email, author);
  }
}
