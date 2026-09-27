import type { AuthorFeedbackNotice, AuthorFeedbackNotificationPort } from '../../../../domain/ports/out/AuthorFeedbackNotificationPort.js';
import type { RetainedContentReview } from '../../../../domain/entities/RetainedContentReview.js';
import type { ModerationAdminAlertPort } from '../../../../domain/ports/out/ModerationAdminAlertPort.js';

export interface AdministratorAlert {
  readonly contentId: string;
  readonly resolutionDeadline: Date;
  readonly alertedAt: Date;
}

export class InMemoryAuthorFeedbackNotices implements AuthorFeedbackNotificationPort, ModerationAdminAlertPort {
  readonly toAuthors: AuthorFeedbackNotice[] = [];
  readonly toAdministrators: AdministratorAlert[] = [];

  async notifyAuthor(notice: AuthorFeedbackNotice): Promise<void> {
    this.toAuthors.push(structuredClone(notice));
  }

  async alertOverdueReview(review: RetainedContentReview, alertedAt: Date): Promise<void> {
    this.toAdministrators.push({ contentId: review.contentId, resolutionDeadline: review.resolutionDeadline, alertedAt });
  }
}
