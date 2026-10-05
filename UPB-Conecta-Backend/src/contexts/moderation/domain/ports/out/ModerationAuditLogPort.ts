import type { ReviewQueueItemRef } from '../../value-objects/ReviewQueueItemRef.js';

export enum ModerationAction {
  PUBLISH = 'publish',
  DISCARD = 'discard'
}

/**
 * HU-49, criterio 7: decision sobre un elemento de la cola. Cumple dos
 * roles a la vez, igual que `AuthorizationAuditLogPort` (HU-46) y
 * `ClassificationCorrectionRepositoryPort` (HU-11):
 *
 * 1. Auditoria append-only (usuario, accion, objeto, marca de tiempo).
 * 2. Fuente de verdad de "que ya se resolvio": en vez de agregar un campo
 *    de estado a `QuarantinedMessage` (HU-04) o `ClassificationResultRecord`
 *    (HU-06/09/10) — que no tienen ningun concepto de "descartado" y no
 *    deberian, porque esa nocion es exclusiva de este panel — un elemento
 *    con una decision registrada simplemente deja de aparecer en
 *    `GetReviewQueue` (criterio 4: "deja de aparecer en la cola"). Un solo
 *    mecanismo resuelve ambas cosas sin tocar el modelo de HU-04/HU-06.
 */
export interface ModerationDecisionRecord {
  readonly subject: string;
  readonly action: ModerationAction;
  readonly ref: ReviewQueueItemRef;
  /** Obligatorio al descartar (criterio 4); opcional al publicar. */
  readonly reason: string | null;
  readonly occurredAt: Date;
}

export interface ModerationAuditLogPort {
  record(decision: ModerationDecisionRecord): Promise<void>;
  findAll(): Promise<readonly ModerationDecisionRecord[]>;
}
