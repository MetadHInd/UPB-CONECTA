import type { ModeratedContentKind } from '../../value-objects/ModerationDecisionInput.js';
import type { AuthorFeedbackView } from '../../value-objects/AuthorFeedback.js';

export interface AuthorFeedbackNotice {
  readonly authorEmail: string;
  readonly contentId: string;
  readonly contentKind: ModeratedContentKind;
  /** Solo la vista del autor: nunca puntaje, umbral ni detalle del modelo. */
  readonly feedback: AuthorFeedbackView;
  readonly createdAt: Date;
}

/**
 * Aviso al autor (criterios 1, 2 y 4). Mismo gap que `SanctionNotificationPort`
 * (HU-35): no hay todavia un canal de entrega al estudiante; el adaptador de
 * produccion deja cada aviso en una bandeja persistente que ese canal consumira.
 */
export interface AuthorFeedbackNotificationPort {
  notifyAuthor(notice: AuthorFeedbackNotice): Promise<void>;
}
