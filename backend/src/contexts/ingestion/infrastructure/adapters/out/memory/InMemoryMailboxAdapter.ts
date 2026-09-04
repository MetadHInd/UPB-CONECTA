import type { MailboxIngestionPort } from '../../../../domain/ports/out/MailboxIngestionPort.js';
import { MailboxUnavailableError } from '../../../../domain/ports/out/MailboxIngestionPort.js';
import type { IngestionCursor } from '../../../../domain/value-objects/IngestionCursor.js';
import type { RawInstitutionalMessage } from '../../../../domain/entities/RawInstitutionalMessage.js';

/**
 * Adaptador en memoria del mismo puerto que el cliente IMAP.
 *
 * Cockburn senala que un mismo puerto admite multiples adaptadores, entre ellos
 * uno que no depende en absoluto de la presencia del recurso real. Esa
 * propiedad es la que permite construir y probar HU-01 completa mientras la
 * Universidad habilita el buzon institucional recolector (riesgo R-01).
 */
export class InMemoryMailboxAdapter implements MailboxIngestionPort {
  private failure: string | null = null;

  constructor(private readonly messages: readonly RawInstitutionalMessage[]) {}

  async fetchUnprocessed(cursor: IngestionCursor, batchSize: number): Promise<RawInstitutionalMessage[]> {
    if (this.failure !== null) {
      throw new MailboxUnavailableError(this.failure);
    }
    return this.messages
      .filter((m) => m.mailboxUid > cursor.lastConfirmedUid)
      .sort((a, b) => a.mailboxUid - b.mailboxUid)
      .slice(0, batchSize);
  }

  /** Permite a las pruebas simular la indisponibilidad de la fuente (RNF-44). */
  simulateUnavailability(cause: string | null): void {
    this.failure = cause;
  }
}
