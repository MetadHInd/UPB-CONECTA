import type { RetainedContentReview } from '../../entities/RetainedContentReview.js';

/** Aviso a los administradores de contenido de que una retencion vencio su plazo (criterio 5). */
export interface ModerationAdminAlertPort {
  alertOverdueReview(review: RetainedContentReview, alertedAt: Date): Promise<void>;
}
