import type { NotificationBatch, PendingNotification } from '../entities/PendingNotification.js';

export interface DailyLimitResult {
  readonly toSend: readonly NotificationBatch[];
  readonly deferred: readonly NotificationBatch[];
}

/**
 * HU-21, criterios 1, 2 y 6: agrupa avisos coincidentes en el tiempo y
 * aplica el limite diario por estudiante, sin perder los que exceden el
 * limite. El deep link (criterios 4, 5) es del adaptador movil; aqui solo
 * se decide que se agrupa, que se envia y que se difiere.
 */
export class NotificationBatchingPolicy {
  constructor(
    private readonly windowMs: number,
    private readonly dailyLimit: number
  ) {
    if (!Number.isInteger(dailyLimit) || dailyLimit <= 0) {
      throw new RangeError(`El limite diario debe ser un entero positivo, se recibio ${dailyLimit}`);
    }
    if (!Number.isFinite(windowMs) || windowMs <= 0) {
      throw new RangeError(`La ventana de agrupacion debe ser positiva, se recibio ${windowMs}`);
    }
  }

  /**
   * Agrupa por estudiante los avisos cuya `generatedAt` cae en la misma
   * ventana de tamaño fijo `windowMs` (criterio 1). Dos avisos separados
   * por menos de `windowMs` pero a caballo entre dos ventanas no se agrupan
   * — es la misma compensación que ya se acepto en HU-03 con las ventanas
   * de deduplicacion: ventanas fijas son deterministas y faciles de probar
   * en los bordes, a cambio de un caso raro sin agrupar.
   */
  groupByWindow(notifications: readonly PendingNotification[]): NotificationBatch[] {
    const buckets = new Map<string, PendingNotification[]>();

    for (const notification of notifications) {
      const windowIndex = Math.floor(notification.generatedAt.getTime() / this.windowMs);
      const key = `${notification.studentId}|${windowIndex}`;
      const bucket = buckets.get(key) ?? [];
      bucket.push(notification);
      buckets.set(key, bucket);
    }

    return [...buckets.values()].map((bucket) => ({
      studentId: bucket[0]!.studentId,
      notifications: bucket,
      maxUrgency: Math.max(...bucket.map((n) => n.urgency))
    }));
  }

  /**
   * Reparte los lotes entre "se envian ahora" y "se difieren" respetando el
   * limite diario por estudiante (criterio 2). Ordena por urgencia
   * descendente antes de repartir, de modo que un lote diferido que vuelva
   * a pasar por aqui en la ventana siguiente (junto a los avisos nuevos de
   * esa ventana) compite otra vez por urgencia y no pierde su prioridad
   * frente a avisos mas nuevos pero menos urgentes (criterio 6).
   */
  applyDailyLimit(
    batches: readonly NotificationBatch[],
    alreadySentToday: ReadonlyMap<string, number>
  ): DailyLimitResult {
    const toSend: NotificationBatch[] = [];
    const deferred: NotificationBatch[] = [];
    const sentInThisPass = new Map<string, number>();

    const byUrgencyDesc = [...batches].sort((a, b) => b.maxUrgency - a.maxUrgency);

    for (const batch of byUrgencyDesc) {
      const alreadySent = alreadySentToday.get(batch.studentId) ?? 0;
      const sentSoFar = alreadySent + (sentInThisPass.get(batch.studentId) ?? 0);

      if (sentSoFar < this.dailyLimit) {
        toSend.push(batch);
        sentInThisPass.set(batch.studentId, (sentInThisPass.get(batch.studentId) ?? 0) + 1);
      } else {
        deferred.push(batch);
      }
    }

    return { toSend, deferred };
  }
}
