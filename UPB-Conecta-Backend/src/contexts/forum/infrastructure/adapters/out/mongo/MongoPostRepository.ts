import type { Collection, Db } from 'mongodb';
import type { Post, PostAuthorSnapshot } from '../../../../domain/entities/Post.js';
import type { PostRepositoryPort } from '../../../../domain/ports/out/PostRepositoryPort.js';

interface PostDocument {
  _id: string;
  topicId: string;
  author: PostAuthorSnapshot;
  title: string;
  text: string;
  publishedAt: Date;
}

function toPost(doc: PostDocument): Post {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

export class MongoPostRepository implements PostRepositoryPort {
  static readonly COLLECTION = 'forum_posts';

  private readonly collection: Collection<PostDocument>;

  constructor(db: Db, collectionName = MongoPostRepository.COLLECTION) {
    this.collection = db.collection<PostDocument>(collectionName);
  }

  /** `idx_topic_published` sirve al listado de un tema, mas reciente primero. */
  static async ensureIndexes(db: Db, collectionName = MongoPostRepository.COLLECTION): Promise<void> {
    await db.collection(collectionName).createIndex({ topicId: 1, publishedAt: -1 }, { name: 'idx_topic_published' });
    await db.collection(collectionName).createIndex({ 'author.email': 1 }, { name: 'idx_author_email' });
  }

  async save(post: Post): Promise<void> {
    const { id, ...rest } = post;
    await this.collection.insertOne({ _id: id, ...rest });
  }

  async findByTopic(topicId: string): Promise<readonly Post[]> {
    return (await this.collection.find({ topicId }).sort({ publishedAt: -1 }).toArray()).map(toPost);
  }
}
