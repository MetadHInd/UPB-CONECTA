import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { ModerationAdminAlertPort } from '../domain/ports/out/ModerationAdminAlertPort.js';
import type { RetainedContentQueuePort } from '../domain/ports/out/RetainedContentQueuePort.js';

/**
 * HU-32, criterio 5: la resolucion humana debe llegar dentro del plazo. Un
 * proceso periodico (planificador futuro, mismo patron que
 * `DueDateReminderScheduler`) invoca este caso de uso: avisa a los
 * administradores, una sola vez por elemento, de cada retencion pendiente cuyo
 * plazo ya vencio. No resuelve nada por si mismo: publicar o rechazar sin un
 * humano contradiria la razon de la retencion.
 */
export class EscalateOverdueRetainedContent {
  constructor(
    private readonly deps: {
      readonly queue: RetainedContentQueuePort;
      readonly alerts: ModerationAdminAlertPort;
      readonly clock: ClockPort;
    }
  ) {}

  async execute(): Promise<{ readonly escalated: number }> {
    const now = this.deps.clock.now();
    const overdue = await this.deps.queue.findOverdueNotEscalated(now);
    for (const review of overdue) {
      await this.deps.alerts.alertOverdueReview(review, now);
      await this.deps.queue.save({ ...review, escalatedAt: now });
    }
    return { escalated: overdue.length };
  }
}
