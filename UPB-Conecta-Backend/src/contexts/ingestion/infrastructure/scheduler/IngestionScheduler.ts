import type { IngestInstitutionalMessagesPort } from '../../domain/ports/in/IngestInstitutionalMessagesPort.js';
import type { IngestionConfig } from '../config/IngestionConfig.js';

/**
 * RF-01, criterio de aceptacion 1: el planificador dispara el caso de uso en el
 * intervalo configurado sin intervencion humana.
 *
 * Relee la configuracion antes de programar cada ciclo, de modo que un cambio
 * del intervalo aplica en la siguiente ejecucion sin reiniciar el proceso.
 * Se usa setTimeout encadenado en lugar de setInterval para que un ciclo lento
 * no se solape con el siguiente sobre el mismo buzon.
 */
export class IngestionScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(
    private readonly useCase: IngestInstitutionalMessagesPort,
    private readonly readConfig: () => IngestionConfig,
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
      intervalMs = this.readConfig().intervalMs;
    } catch (error) {
      // Una configuracion invalida no debe detener el servicio en silencio.
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
