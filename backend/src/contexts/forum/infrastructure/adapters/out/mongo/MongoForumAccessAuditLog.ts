import type { Collection, Db } from 'mongodb';
import type { ForumAccessAuditPort, ForumAccessDeniedEvent } from '../../../../domain/ports/out/ForumAccessAuditPort.js';

/**
 * Auditoria de accesos rechazados a temas restringidos (HU-30 criterio 4).
 * Append-only (`insertOne`): cada intento es un hecho, nunca se sobrescribe.
 */
export class MongoForumAccessAuditLog implements ForumAccessAuditPort {
  static readonly COLLECTION = 'forum_access_audit';

  private readonly collection: Collection<ForumAccessDeniedEvent>;

  constructor(db: Db, collectionName = MongoForumAccessAuditLog.COLLECTION) {
    this.collection = db.collection<ForumAccessDeniedEvent>(collectionName);
  }

  static async ensureIndexes(db: Db, collectionName = MongoForumAccessAuditLog.COLLECTION): Promise<void> {
    await db.collection(collectionName).createIndex({ studentEmail: 1, occurredAt: -1 }, { name: 'idx_student_occurred' });
    await db.collection(collectionName).createIndex({ topicId: 1, occurredAt: -1 }, { name: 'idx_topic_occurred' });
  }

  async record(event: ForumAccessDeniedEvent): Promise<void> {
    await this.collection.insertOne({ ...event });
  }
}
