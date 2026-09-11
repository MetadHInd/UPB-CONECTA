import type { MailboxIngestionPort, UntranslatableMessage } from '../../../../domain/ports/out/MailboxIngestionPort.js';
import { MailboxUnavailableError } from '../../../../domain/ports/out/MailboxIngestionPort.js';
import type { IngestionCursor } from '../../../../domain/value-objects/IngestionCursor.js';
import type { RawInstitutionalMessage } from '../../../../domain/entities/RawInstitutionalMessage.js';
import { MessageId, InvalidMessageIdError } from '../../../../domain/value-objects/MessageId.js';

/**
 * Contrato minimo que debe satisfacer el cliente IMAP concreto.
 *
 * Se declara aqui en lugar de importar el tipo de la libreria para que el
 * cambio de cliente no propague modificaciones fuera de este archivo, y para
 * que el adaptador sea probable sin abrir una conexion de red.
 */
export interface ImapClient {
  connect(): Promise<void>;
  logout(): Promise<void>;
  openMailbox(name: string): Promise<void>;
  fetchSince(uid: number, limit: number): Promise<ImapEnvelope[]>;
}

export interface ImapEnvelope {
  readonly uid: number;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly from: string;
  readonly subject: string;
  readonly date: Date;
  readonly source: string;
}

/**
 * Capa anticorrupcion sobre el buzon institucional recolector.
 *
 * Traduce el vocabulario del proveedor de correo al del dominio y no decide
 * nada mas. No determina que constituye una convocatoria, a que programa
 * corresponde ni con cuanta anticipacion notificar, porque esas son reglas de
 * negocio que permanecen del lado interno del puerto.
 */
export class ImapMailboxAdapter implements MailboxIngestionPort {
  constructor(
    private readonly client: ImapClient,
    private readonly mailboxName: string,
    private onUntranslatable: (message: UntranslatableMessage) => void = () => {}
  ) {}

  setOnUntranslatable(handler: (message: UntranslatableMessage) => void): void {
    this.onUntranslatable = handler;
  }

  async fetchUnprocessed(cursor: IngestionCursor, batchSize: number): Promise<RawInstitutionalMessage[]> {
    let envelopes: ImapEnvelope[];
    try {
      await this.client.connect();
      await this.client.openMailbox(this.mailboxName);
      envelopes = await this.client.fetchSince(cursor.lastConfirmedUid, batchSize);
    } catch (error) {
      throw new MailboxUnavailableError(error instanceof Error ? error.message : String(error));
    } finally {
      await this.client.logout().catch(() => undefined);
    }

    const translated: RawInstitutionalMessage[] = [];
    for (const envelope of envelopes) {
      const message = this.translate(envelope);
      if (message !== null) translated.push(message);
    }
    return translated;
  }

  private translate(envelope: ImapEnvelope): RawInstitutionalMessage | null {
    try {
      const header = envelope.headers['message-id'] ?? envelope.headers['Message-ID'];
      return {
        messageId: MessageId.fromHeader(header),
        mailboxUid: envelope.uid,
        sender: envelope.from,
        subject: envelope.subject,
        receivedAt: envelope.date,
        rawBody: envelope.source
      };
    } catch (error) {
      if (error instanceof InvalidMessageIdError) {
        // Un mensaje sin identidad no puede sostener la garantia de idempotencia.
        // Se reporta para que HU-04 lo derive a cuarentena y el lote continua.
        this.onUntranslatable({ mailboxUid: envelope.uid, cause: error.message, rawSource: envelope.source });
        return null;
      }
      throw error;
    }
  }
}
