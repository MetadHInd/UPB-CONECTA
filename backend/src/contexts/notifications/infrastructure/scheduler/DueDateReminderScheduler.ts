import type { DueDateReminderConfig } from '../config/DueDateReminderConfig.js';

export interface EmitDueDateRemindersUseCase {
  execute(): Promise<unknown>;
}

/**
 * HU-19, criterio 2: dispara `EmitDueDateReminders` en el intervalo
 * configurado, sin intervencion humana, de modo que ningun aviso tarde mas
 * de 60 segundos en emitirse despues de su instante previsto (siempre que
 * `pollIntervalMs <= 60000`, que `readDueDateReminderConfig` ya garantiza).
 *
 * Mismo patron que `IngestionScheduler` (HU-01): `setTimeout` encadenado (no
 * `setInterval`) para que un ciclo lento no se solape con el siguiente, y
 * relee la configuracion antes de cada ciclo para que un cambio de
 * intervalo aplique sin reiniciar el proceso. No se reutiliza literalmente
 * `IngestionScheduler` porque esta tipado al puerto y a la configuracion de
 * `ingestion`; duplicar esta clase pequeña es mas simple y no acopla
 * `notifications` a `ingestion` para algo que no es I/O de dominio.
 */
export class DueDateReminderScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(
    private readonly useCase: EmitDueDateRemindersUseCase,
    private readonly readConfig: () => DueDateReminderConfig,
    private readonly onError: (error: unknown) => void = () => {}
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.scheduleNextCycle();
  }

  stop(): void {
    this.running = false;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  get isRunning(): boolean {
    return this.running;
  }

  private scheduleNextCycle(): void {
    if (!this.running) return;

    let intervalMs: number;
    try {
      intervalMs = this.readConfig().pollIntervalMs;
    } catch (error) {
      this.onError(error);
      return;
    }

    this.timer = setTimeout(() => {
      void this.runCycle();
    }, intervalMs);
  }

  private async runCycle(): Promise<void> {
    try {
      await this.useCase.execute();
    } catch (error) {
      this.onError(error);
    } finally {
      this.scheduleNextCycle();
    }
  }
}
