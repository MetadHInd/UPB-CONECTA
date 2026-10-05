import type { MailboxIngestionPort } from '../../../../domain/ports/out/MailboxIngestionPort.js';
import { MailboxUnavailableError } from '../../../../domain/ports/out/MailboxIngestionPort.js';
import type { IngestionCursor } from '../../../../domain/value-objects/IngestionCursor.js';
import type { RawInstitutionalMessage } from '../../../../domain/entities/RawInstitutionalMessage.js';
import type { ClockPort } from '../../../../domain/ports/out/ClockPort.js';

/**
 * Circuit Breaker simple para el adaptador del buzón.
 *
 * Implementa los estados closed, open y half-open. El circuito se abre cuando
 * se alcanzan `failureThreshold` fallos consecutivos (cada fallo corresponde
 * a una ejecucion externa que ya agotó los reintentos del adaptador). Mientras
 * está `open`, las llamadas fallan rápido con MailboxUnavailableError sin
 * invocar al adaptador subyacente. Tras `cooldownMs` pasa a `half-open` y
 * permite un intento real; si ese intento tiene éxito, vuelve a `closed`,
 * si falla, vuelve a `open` y reinicia el temporizador.
 *
 * El estado vive en memoria en la instancia del decorador y persiste entre
 * llamadas consecutivas del scheduler (es decir, entre ejecuciones de
 * `fetchUnprocessed`). Usa `ClockPort` para determinismo en pruebas.
 *
 * Trazabilidad: RF-08, RNF-10, RNF-12, RNF-44. CU-01, excepcion E1.
 */
export interface CircuitBreakerOptions {
  readonly failureThreshold: number; // fallos consecutivos para abrir el circuito
  readonly cooldownMs: number; // tiempo de enfriamiento antes de intentar half-open
  readonly clock?: ClockPort;
}

export class CircuitBreakerMailboxAdapter implements MailboxIngestionPort {
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private consecutiveFailures = 0;
  private openedAt: Date | null = null;
  private halfOpenInFlight = false;

  constructor(private readonly delegate: MailboxIngestionPort, private readonly options: CircuitBreakerOptions) {}

  private now(): Date {
    return this.options.clock ? this.options.clock.now() : new Date();
  }

  async fetchUnprocessed(cursor: IngestionCursor, batchSize: number): Promise<RawInstitutionalMessage[]> {
    const failureThreshold = this.options.failureThreshold ?? 3;
    const cooldownMs = this.options.cooldownMs ?? 60_000;

    if (this.state === 'open') {
      const openedAt = this.openedAt ?? new Date(0);
      const elapsed = this.now().getTime() - openedAt.getTime();
      if (elapsed < cooldownMs) {
        // fallo rapido: circuito abierto
        throw new MailboxUnavailableError('El circuito del buzón está abierto por fallos consecutivos');
      }
      // transicionar a half-open y permitir un intento
      this.state = 'half-open';
      this.halfOpenInFlight = false;
    }

    if (this.state === 'half-open') {
      if (this.halfOpenInFlight) {
        throw new MailboxUnavailableError('El circuito del buzón está en half-open y ya hay un intento en curso');
      }
      // marcar que hay un intento en curso para esta transicion
      this.halfOpenInFlight = true;
      try {
        const res = await this.delegate.fetchUnprocessed(cursor, batchSize);
        // exito: cerrar circuito
        this.state = 'closed';
        this.consecutiveFailures = 0;
        this.openedAt = null;
        return res;
      } catch (error) {
        // fallo: volver a open y reiniciar el temporizador
        this.state = 'open';
        this.openedAt = this.now();
        this.consecutiveFailures = failureThreshold; // mantener contador en umbral
        this.halfOpenInFlight = false;
        throw error;
      }
    }

    // estado closed
    try {
      const res = await this.delegate.fetchUnprocessed(cursor, batchSize);
      this.consecutiveFailures = 0;
      return res;
    } catch (error) {
      // contar solo fallos que provengan del adaptador (por nombre)
      if (error instanceof Error && error.name === 'MailboxUnavailableError') {
        this.consecutiveFailures += 1;
        if (this.consecutiveFailures >= failureThreshold) {
          this.state = 'open';
          this.openedAt = this.now();
        }
      }
      throw error;
    }
  }
}
