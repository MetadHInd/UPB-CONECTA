import type { MailboxIngestionPort, MailboxUnavailableError } from '../../../../domain/ports/out/MailboxIngestionPort.js';
import type { IngestionCursor } from '../../../../domain/value-objects/IngestionCursor.js';
import type { RawInstitutionalMessage } from '../../../../domain/entities/RawInstitutionalMessage.js';
import type { ClockPort } from '../../../../domain/ports/out/ClockPort.js';

/**
 * HU-05: Reintento con espera exponencial ante indisponibilidad del buzón.
 * Trazabilidad: RF-08, RNF-10, RNF-12, RNF-44. CU-01, excepción E1.
 *
 * Este decorador implementa un bucle de reintentos con backoff exponencial
 * y acepta una funcion `wait` inyectable para que las pruebas puedan controlar
 * el paso del tiempo (vi.useFakeTimers()). El decorador solo reintenta cuando
 * el adaptador subyacente lanza `MailboxUnavailableError`. Tras agotar los
 * reintentos, el error se propaga para que la logica de retencion del cursor
 * en el dominio siga intacta (HU-01).
 */
export interface RetryingOptions {
  readonly maxRetries: number; // cantidad de reintentos adicionales al intento inicial
  readonly baseMs: number; // backoff base en ms
  readonly maxMs: number; // tope maximo en ms
  readonly wait?: (ms: number) => Promise<void>;
  readonly clock?: ClockPort;
}

export class RetryingMailboxAdapter implements MailboxIngestionPort {
  constructor(
    private readonly delegate: MailboxIngestionPort,
    private readonly options: RetryingOptions
  ) {}

  async fetchUnprocessed(cursor: IngestionCursor, batchSize: number): Promise<RawInstitutionalMessage[]> {
    const maxRetries = this.options.maxRetries ?? 0;
    const baseMs = this.options.baseMs ?? 1000;
    const maxMs = this.options.maxMs ?? 30_000;
    const wait = this.options.wait ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

    let attempt = 0;
    let lastError: unknown = null;

    while (true) {
      try {
        return await this.delegate.fetchUnprocessed(cursor, batchSize);
      } catch (error) {
        lastError = error;
        // Reintentar solo si es MailboxUnavailableError; propagar otra cosa.
        if (!(error instanceof Error) || error.name !== 'MailboxUnavailableError') {
          throw error;
        }

        if (attempt >= maxRetries) break; // agotado

        // calcular backoff exponencial: base * 2^attempt, acotado por maxMs
        const delay = Math.min(baseMs * (2 ** attempt), maxMs);
        await wait(delay);
        attempt += 1;
        continue;
      }
    }

    // Si llegamos aca, los reintentos se agotaron: propagar el ultimo error
    throw lastError;
  }
}
