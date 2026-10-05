import type { Collection, Db } from 'mongodb';
import type { ForumAuthor } from '../../../../domain/entities/ForumAuthor.js';
import type { ForumAuthorRepositoryPort } from '../../../../domain/ports/out/ForumAuthorRepositoryPort.js';

interface ForumAuthorDocument {
  _id: string;
  name: string;
  programName: string;
  programId: string | null;
  syncedAt: Date;
}

/** Autores verificados del foro. `_id = email` normalizado; solo lecturas por `_id`. */
export class MongoForumAuthorRepository implements ForumAuthorRepositoryPort {
  static readonly COLLECTION = 'forum_authors';

  private readonly collection: Collection<ForumAuthorDocument>;

  constructor(db: Db, collectionName = MongoForumAuthorRepository.COLLECTION) {
    this.collection = db.collection<ForumAuthorDocument>(collectionName);
  }

  async findByEmail(email: string): Promise<ForumAuthor | null> {
    const doc = await this.collection.findOne({ _id: email });
    if (doc === null) return null;
    const { _id, ...rest } = doc;
    return { email: _id, ...rest };
  }

  async save(author: ForumAuthor): Promise<void> {
    const { email, ...rest } = author;
    await this.collection.replaceOne({ _id: email }, rest, { upsert: true });
  }
}
