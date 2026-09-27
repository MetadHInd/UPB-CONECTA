import type { ModeratedContentKind, ModerationVerdict } from '../../value-objects/ModerationDecisionInput.js';

/**
 * HU-32, criterio 6: registro de auditoria de toda decision de moderacion.
 * Conserva el fragmento y la categoria para sustentar la sancion ante el
 * usuario, y el detalle interno del modelo. Es la representacion de auditoria
 * de la decision; la que ve el autor es `AuthorFeedbackView`. Append-only.
 *
 * `fragment` y `category` no admiten nulo: una decision que no puede
 * sustentarse no se registra (se rechaza antes). Una publicacion directa no
 * motiva nada y no se registra aqui; la aprobacion humana de lo retenido si,
 * con la categoria y el fragmento de la retencion que se revirtio.
 */
export interface ContentModerationLogEntry {
  readonly contentId: string;
  readonly contentKind: ModeratedContentKind;
  readonly authorEmail: string;
  readonly verdict: ModerationVerdict;
  readonly category: string;
  readonly fragment: string;
  /** Origen automatico (p. ej. `auto-moderation`) o el revisor humano que resolvio. */
  readonly decidedBy: string;
  readonly source: 'automatic' | 'human-review';
  readonly internalDetail: Readonly<Record<string, unknown>> | null;
  readonly occurredAt: Date;
}

export interface ContentModerationLogPort {
  record(entry: ContentModerationLogEntry): Promise<void>;
  /** Mas antigua primero. */
  findByContentId(contentId: string): Promise<readonly ContentModerationLogEntry[]>;
}
