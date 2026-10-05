import type { ConvocatoriaId } from '../../../ingestion/domain/value-objects/ConvocatoriaId.js';
import type { DueDate } from '../../../ingestion/domain/value-objects/DueDate.js';
import type { MessageCategory } from '../../../classification/domain/value-objects/MessageCategory.js';
import type { ReviewQueueItemRef } from '../value-objects/ReviewQueueItemRef.js';

/**
 * HU-49, criterio 1: un mensaje en cuarentena (HU-04) nunca se pudo
 * normalizar — por eso no tiene contenido normalizado, categoria propuesta
 * ni fecha de cierre. No es un dato faltante por error, es la naturaleza
 * del elemento: si se hubiera podido normalizar, no habria ido a cuarentena.
 */
export interface QuarantineQueueItem {
  readonly ref: Extract<ReviewQueueItemRef, { kind: 'quarantine' }>;
  readonly cause: string;
  readonly rawSource: string;
  readonly normalizedContent: null;
  readonly proposedCategory: null;
  readonly confidenceScore: null;
  readonly dueDate: null;
  readonly detectedAt: Date;
}

/**
 * Criterio 2: "el crudo original" no existe para un mensaje que si se
 * normalizo con exito — HU-02 descarta el MIME crudo despues de normalizar
 * (solo la cuarentena lo conserva, para diagnostico). Persistir tambien el
 * crudo de todo mensaje exitosamente normalizado es un cambio de alcance de
 * HU-02, fuera de esta historia — ver README, seccion "Diferido".
 */
export interface PendingReviewQueueItem {
  readonly ref: Extract<ReviewQueueItemRef, { kind: 'pending-review' }>;
  readonly convocatoriaId: ConvocatoriaId;
  readonly cause: string;
  readonly rawSource: null;
  readonly normalizedContent: string;
  readonly proposedCategory: MessageCategory;
  readonly confidenceScore: number;
  readonly dueDate: DueDate;
  readonly detectedAt: Date;
}

export type ReviewQueueItem = QuarantineQueueItem | PendingReviewQueueItem;

/** Criterio 6: se agrega al presentar la cola (`GetReviewQueue`), no es un campo persistido. */
export interface PrioritizedReviewQueueItem {
  readonly item: ReviewQueueItem;
  readonly isCritical: boolean;
}
