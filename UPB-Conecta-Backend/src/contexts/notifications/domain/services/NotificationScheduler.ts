import { AnticipationThreshold } from '../value-objects/AnticipationThreshold.js';

/** Un umbral resuelto a un instante concreto para una convocatoria puntual. */
export interface ScheduledReminder {
  readonly thresholdMinutes: number;
  /** Instante en que corresponde disparar el aviso. Nunca queda en el pasado: ver `immediate`. */
  readonly firesAt: Date;
  /**
   * Criterio 6: true cuando, al calcular el aviso, el instante que le
   * correspondia ya habia pasado (queda menos tiempo para el cierre que la
   * propia anticipacion) — el aviso se emite de inmediato (`firesAt = now`)
   * en lugar de perderse silenciosamente.
   */
  readonly immediate: boolean;
}

/**
 * HU-19 (RF-27, RNF-03, RF-62): "`NotificationScheduler` como servicio de
 * dominio" (diseno de la historia en Jira). Puro: dado el cierre de una
 * convocatoria, el instante actual y los umbrales aplicables (los
 * configurados por el sistema mas el que eligio el estudiante), calcula
 * cuando deberia dispararse cada aviso — no hace I/O, no decide a quien va
 * dirigido ni si todavia corresponde emitirlo (eso es de
 * `EmitDueDateReminders`, que relee el estado vigente en cada ciclo).
 */
export class NotificationScheduler {
  /**
   * Criterio 1: un umbral por cada anticipacion distinta (sistema + la del
   * estudiante), sin duplicar cuando coinciden en minutos — por ejemplo, si
   * el estudiante eligio exactamente el mismo valor que ya trae la
   * configuracion del sistema.
   *
   * Criterio 6, caso borde explicito (no un efecto colateral): un umbral
   * cuyo instante ya paso respecto a `now` (queda menos tiempo para el
   * cierre que la propia anticipacion) se resuelve con `firesAt = now` e
   * `immediate = true`, para que el aviso se emita de inmediato en vez de
   * perderse.
   */
  computeReminders(
    dueAt: Date,
    now: Date,
    systemThresholds: readonly AnticipationThreshold[],
    studentThreshold: AnticipationThreshold
  ): ScheduledReminder[] {
    const byMinutes = new Map<number, AnticipationThreshold>();
    for (const threshold of [...systemThresholds, studentThreshold]) {
      byMinutes.set(threshold.minutes, threshold);
    }

    return [...byMinutes.values()]
      .map((threshold) => {
        const scheduledInstant = threshold.instantFor(dueAt);
        const immediate = scheduledInstant.getTime() <= now.getTime();
        return {
          thresholdMinutes: threshold.minutes,
          firesAt: immediate ? now : scheduledInstant,
          immediate
        };
      })
      .sort((a, b) => a.firesAt.getTime() - b.firesAt.getTime());
  }
}

/**
 * Mayor urgencia cuanto menos tiempo falta para el cierre (contrato de
 * `PendingNotification.urgency`, HU-21). Sin fecha concreta (convocatoria
 * sin vencimiento, o un aviso que no depende del cierre como el de HU-20),
 * se usa una urgencia base neutra. Compartida entre HU-19 (avisos de
 * vencimiento) y HU-20 (avisos de publicacion, cuando la convocatoria si
 * declara cierre) para que ambas produzcan `PendingNotification` comparables
 * en un mismo lote de `NotificationBatchingPolicy` (HU-21).
 */
export function computeUrgency(remainingMs: number | null): number {
  if (remainingMs === null) return 1;
  const remainingMinutes = Math.max(remainingMs, 0) / 60_000;
  return Math.round(1_000_000 / (remainingMinutes + 1));
}
