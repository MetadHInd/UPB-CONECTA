import type { PrioritizedReviewQueueItem, ReviewQueueItem } from '../entities/ReviewQueueItem.js';

/**
 * HU-49, criterio 5: ordena por fecha de cierre mas proxima. Un elemento sin
 * fecha de cierre "con-fecha" (cuarentena, sin-vencimiento, o ambigua) no
 * tiene una presion de plazo que priorizar — se ordena al final, no antes:
 * priorizar por plazo significa que lo que primero se vence es lo primero
 * que se atiende, y lo que no tiene un plazo cierto no compite por ese
 * primer lugar.
 *
 * Criterio 6: "mas de un plazo definido sin resolverse" es distinto de la
 * fecha de cierre de la convocatoria — es cuanto tiempo lleva el elemento
 * *en la cola*, sin que nadie lo resuelva. `criticalAgeMs` es esa
 * configuracion (mismo patron que `DEDUPLICATION_WINDOW_MS`,
 * `INGESTION_MESSAGE_MAX_ATTEMPTS`): un numero explicito, no un valor
 * magico en el codigo.
 */
export function prioritizeReviewQueue(
  items: readonly ReviewQueueItem[],
  now: Date,
  criticalAgeMs: number
): readonly PrioritizedReviewQueueItem[] {
  const withPriority = items.map((item) => ({
    item,
    isCritical: now.getTime() - item.detectedAt.getTime() >= criticalAgeMs
  }));

  return [...withPriority].sort((a, b) => dueDateRank(a.item) - dueDateRank(b.item));
}

/** Menor rango = mas urgente. Sin fecha cierta, el rango es +Infinity: siempre al final. */
function dueDateRank(item: ReviewQueueItem): number {
  if (item.dueDate === null || item.dueDate.kind !== 'con-fecha') {
    return Number.POSITIVE_INFINITY;
  }
  return item.dueDate.date.getTime();
}
