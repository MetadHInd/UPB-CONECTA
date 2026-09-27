import type { RetainedContentReview } from '../domain/entities/RetainedContentReview.js';
import type { AuthorFeedbackView } from '../domain/value-objects/AuthorFeedback.js';

export type ModerationFeedbackError = 'invalid-decision' | 'invalid-request' | 'unknown-category' | 'not-found' | 'already-resolved';

export interface ModerationFeedbackFailure {
  readonly ok: false;
  readonly error: ModerationFeedbackError;
  readonly message: string;
}

/** Resultado de resolver (aprobar o rechazar) un contenido retenido. */
export type ResolveRetainedContentResult =
  | { readonly ok: true; readonly review: RetainedContentReview; readonly feedback: AuthorFeedbackView }
  | ModerationFeedbackFailure;

export function failure(error: ModerationFeedbackError, message: string): ModerationFeedbackFailure {
  return { ok: false, error, message };
}

/** Correo en su forma canonica; mismo criterio que `normalizeForumEmail` (foro), sin acoplar los contextos. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
