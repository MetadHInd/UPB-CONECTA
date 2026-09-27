import type { Collection, Db } from 'mongodb';
import type { RetainedContentReview } from '../../../../domain/entities/RetainedContentReview.js';
import type { AuthorFeedbackNotice, AuthorFeedbackNotificationPort } from '../../../../domain/ports/out/AuthorFeedbackNotificationPort.js';
import type { ModerationAdminAlertPort } from '../../../../domain/ports/out/ModerationAdminAlertPort.js';

export const CONTENT_ADMINS_RECIPIENT = 'content-admins';

export type ModerationNoticeDocument =
  | { readonly recipient: string; readonly type: 'author-feedback'; readonly notice: AuthorFeedbackNotice; readonly deliveredAt: Date | null }
  | {
      readonly recipient: typeof CONTENT_ADMINS_RECIPIENT;
      readonly type: 'overdue-review';
      readonly contentId: string;
      readonly resolutionDeadline: Date;
      readonly alertedAt: Date;
      readonly deliveredAt: Date | null;
    };

/**
 * Bandeja persistente de avisos de moderacion (HU-32). Mismo patron que
 * `MongoSanctionNoticeOutbox` (HU-35): no existe todavia un canal de entrega
 * (push o correo), asi que cada aviso queda con `deliveredAt: null` para que
 * ese canal lo consuma sin perder ninguno. Es una coleccion propia y no la de
 * sanciones porque aquellos avisos son de tipo `SanctionNotice`, del foro; los
 * de esta historia son de moderacion y no deben acoplar `moderation` a `forum`.
 * En la bandeja del autor solo se guarda la vista del autor (`AuthorFeedbackView`).
 */
export class MongoModerationNoticeOutbox implements AuthorFeedbackNotificationPort, ModerationAdminAlertPort {
  static readonly COLLECTION = 'moderation_notices';

  private readonly collection: Collection<ModerationNoticeDocument>;

  constructor(db: Db, collectionName = MongoModerationNoticeOutbox.COLLECTION) {
    this.collection = db.collection<ModerationNoticeDocument>(collectionName);
  }

  static async ensureIndexes(db: Db, collectionName = MongoModerationNoticeOutbox.COLLECTION): Promise<void> {
    await db.collection(collectionName).createIndex({ recipient: 1, deliveredAt: 1 }, { name: 'idx_recipient_pending' });
  }

  async notifyAuthor(notice: AuthorFeedbackNotice): Promise<void> {
    await this.collection.insertOne({ recipient: notice.authorEmail, type: 'author-feedback', notice, deliveredAt: null });
  }

  async alertOverdueReview(review: RetainedContentReview, alertedAt: Date): Promise<void> {
    await this.collection.insertOne({
      recipient: CONTENT_ADMINS_RECIPIENT,
      type: 'overdue-review',
      contentId: review.contentId,
      resolutionDeadline: review.resolutionDeadline,
      alertedAt,
      deliveredAt: null
    });
  }
}
