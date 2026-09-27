import type { RetainedContentReview } from '../domain/entities/RetainedContentReview.js';
import { blockedFeedback, inReviewFeedback, resolutionDeadlineFor } from '../domain/services/AuthorFeedbackPolicy.js';
import type { AuthorFeedbackNotificationPort } from '../domain/ports/out/AuthorFeedbackNotificationPort.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { ContentModerationLogPort } from '../domain/ports/out/ContentModerationLogPort.js';
import type { RetainedContentQueuePort } from '../domain/ports/out/RetainedContentQueuePort.js';
import type { AuthorFeedbackView } from '../domain/value-objects/AuthorFeedback.js';
import type { ModerationDecisionInput } from '../domain/value-objects/ModerationDecisionInput.js';
import { findNormForCategory, type ModerationFeedbackConfig } from '../domain/value-objects/ModerationFeedbackConfig.js';
import { failure, normalizeEmail, type ModerationFeedbackFailure } from './ModerationFeedbackResults.js';

/**
 * `no-action`: se publico directo, no hay nada que explicar. `already-*`: un
 * reintento de una decision ya procesada; no se duplica cola, registro ni aviso.
 */
export type ModerationDecisionStatus = 'no-action' | 'retained' | 'already-retained' | 'blocked' | 'already-blocked';

export type HandleModerationDecisionResult =
  | {
      readonly ok: true;
      readonly status: ModerationDecisionStatus;
      /** Lo que ve el autor; `null` si no hay nada que decirle. Nunca lleva puntaje, umbral ni detalle del modelo. */
      readonly feedback: AuthorFeedbackView | null;
      /** Elemento de la cola creado al retener; `null` en los demas casos. */
      readonly review: RetainedContentReview | null;
    }
  | ModerationFeedbackFailure;

export interface HandleModerationDecisionDependencies {
  readonly config: ModerationFeedbackConfig;
  readonly queue: RetainedContentQueuePort;
  readonly log: ContentModerationLogPort;
  readonly notifications: AuthorFeedbackNotificationPort;
  readonly clock: ClockPort;
}

/**
 * HU-32 (RF-52; criterios 1, 2, 3, 5 y 6). Recibe la decision de moderacion
 * de un contenido (HU-31 o quien la produzca, ver `ModerationDecisionInput`) y
 * produce las dos representaciones de la misma decision, por separado:
 *
 * - El registro de auditoria (`ContentModerationLogPort`): fragmento, categoria
 *   y detalle interno, para sustentar la sancion (criterio 6).
 * - La explicacion al autor (`AuthorFeedbackView`): motivo y norma, o el aviso
 *   de revision con su plazo, sin puntaje ni umbral ni modelo (criterio 3).
 *
 * Retener ademas encola la revision humana con plazo de resolucion (criterio 5).
 * Una decision que no se puede sustentar (sin categoria o sin fragmento) se
 * rechaza sin registrar ni avisar nada: es mejor un error visible que una
 * sancion que luego no se pueda explicar.
 */
export class HandleModerationDecision {
  constructor(private readonly deps: HandleModerationDecisionDependencies) {}

  async execute(input: ModerationDecisionInput): Promise<HandleModerationDecisionResult> {
    const contentId = input.contentId.trim();
    const authorEmail = normalizeEmail(input.authorEmail);
    if (contentId === '' || authorEmail === '') {
      return failure('invalid-decision', 'La decision debe indicar el contenido y su autor.');
    }

    if (input.verdict === 'publish') return { ok: true, status: 'no-action', feedback: null, review: null };

    const category = input.category?.trim() ?? '';
    const fragment = input.fragment?.trim() ?? '';
    if (category === '' || fragment === '') {
      return failure('invalid-decision', 'Retener o bloquear exige la categoria de infraccion y el fragmento que la motivo.');
    }
    if (findNormForCategory(this.deps.config, category) === null) {
      return failure('unknown-category', `La categoria "${category}" no tiene una norma de convivencia configurada.`);
    }

    return input.verdict === 'retain'
      ? this.retain(input, { contentId, authorEmail, category, fragment })
      : this.block(input, { contentId, authorEmail, category, fragment });
  }

  private async retain(input: ModerationDecisionInput, data: NormalizedDecision): Promise<HandleModerationDecisionResult> {
    const { config, queue, log, notifications, clock } = this.deps;

    const existing = await queue.findByContentId(data.contentId);
    if (existing) {
      const feedback = existing.status === 'pending' ? inReviewFeedback(config, data.contentId, existing.retainedAt) : null;
      return { ok: true, status: 'already-retained', feedback, review: null };
    }

    const now = clock.now();
    const review: RetainedContentReview = {
      contentId: data.contentId,
      contentKind: input.contentKind,
      authorEmail: data.authorEmail,
      category: data.category,
      fragment: data.fragment,
      retainedAt: now,
      resolutionDeadline: resolutionDeadlineFor(config, now),
      status: 'pending',
      resolvedAt: null,
      resolvedBy: null,
      escalatedAt: null
    };

    await log.record({
      contentId: data.contentId,
      contentKind: input.contentKind,
      authorEmail: data.authorEmail,
      verdict: 'retain',
      category: data.category,
      fragment: data.fragment,
      decidedBy: input.detectedBy,
      source: 'automatic',
      internalDetail: input.internalDetail ?? null,
      occurredAt: now
    });
    await queue.save(review);

    const feedback = inReviewFeedback(config, data.contentId, now);
    await notifications.notifyAuthor({
      authorEmail: data.authorEmail,
      contentId: data.contentId,
      contentKind: input.contentKind,
      feedback,
      createdAt: now
    });
    return { ok: true, status: 'retained', feedback, review };
  }

  private async block(input: ModerationDecisionInput, data: NormalizedDecision): Promise<HandleModerationDecisionResult> {
    const { config, queue, log, notifications, clock } = this.deps;

    const feedback = blockedFeedback(config, data.contentId, data.category);
    const alreadyBlocked = (await log.findByContentId(data.contentId)).some((entry) => entry.verdict === 'block');
    if (alreadyBlocked) return { ok: true, status: 'already-blocked', feedback, review: null };

    const now = clock.now();
    await log.record({
      contentId: data.contentId,
      contentKind: input.contentKind,
      authorEmail: data.authorEmail,
      verdict: 'block',
      category: data.category,
      fragment: data.fragment,
      decidedBy: input.detectedBy,
      source: 'automatic',
      internalDetail: input.internalDetail ?? null,
      occurredAt: now
    });

    // Bloquear algo que estaba retenido resuelve su revision pendiente: no debe seguir en la cola ni vencerse.
    const pending = await queue.findByContentId(data.contentId);
    if (pending?.status === 'pending') {
      await queue.save({ ...pending, status: 'rejected', resolvedAt: now, resolvedBy: input.detectedBy });
    }

    await notifications.notifyAuthor({
      authorEmail: data.authorEmail,
      contentId: data.contentId,
      contentKind: input.contentKind,
      feedback,
      createdAt: now
    });
    return { ok: true, status: 'blocked', feedback, review: null };
  }
}

interface NormalizedDecision {
  readonly contentId: string;
  readonly authorEmail: string;
  readonly category: string;
  readonly fragment: string;
}
