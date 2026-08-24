import type { MessageId } from '../value-objects/MessageId.js';

/**
 * Mensaje tal como lo entrega el buzon, ya traducido por el adaptador a
 * vocabulario del dominio pero todavia sin normalizar. La normalizacion del
 * cuerpo y la extraccion de metadatos son HU-02 y no pertenecen a esta historia.
 */
export interface RawInstitutionalMessage {
  readonly messageId: MessageId;
  /** Numero secuencial asignado por el buzon, base del punto de lectura. */
  readonly mailboxUid: number;
  readonly sender: string;
  readonly subject: string;
  readonly receivedAt: Date;
  readonly rawBody: string;
}
