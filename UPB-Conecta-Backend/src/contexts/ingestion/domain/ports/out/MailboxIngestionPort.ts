import type { IngestionCursor } from '../../value-objects/IngestionCursor.js';
import type { RawInstitutionalMessage } from '../../entities/RawInstitutionalMessage.js';

/**
 * Puerto de salida hacia el buzon institucional recolector.
 *
 * Es la frontera declarada por Cockburn: un mismo puerto admite el adaptador
 * IMAP real y un adaptador en memoria que no depende de la presencia del buzon,
 * propiedad que sostiene la estrategia de pruebas de RNF-44.
 */
/**
 * HU-04, criterio 3: junto al uid y la causa se reporta el contenido crudo
 * original, para que la cuarentena lo conserve y quede disponible para
 * diagnostico sin depender de que el buzon todavia lo tenga.
 */
export interface UntranslatableMessage {
  readonly mailboxUid: number;
  readonly cause: string;
  readonly rawSource: string;
}

export interface MailboxIngestionPort {
  /**
   * Recupera los mensajes posteriores al punto de lectura, en orden ascendente
   * de uid y acotados por el tamano de lote configurado.
   */
  fetchUnprocessed(cursor: IngestionCursor, batchSize: number): Promise<RawInstitutionalMessage[]>;
  /**
   * Opcional: algunos adaptadores (por ejemplo IMAP) pueden reportar mensajes
   * no traducibles por falta de identidad; el orquestador puede suscribirse
   * para que la ejecución en curso los derive a cuarentena (HU-04) sin
   * interrumpir el resto del lote.
   */
  setOnUntranslatable?(handler: (message: UntranslatableMessage) => void): void;
}

export class MailboxUnavailableError extends Error {
  constructor(cause: string) {
    super(`El buzon institucional no responde: ${cause}`);
    this.name = 'MailboxUnavailableError';
  }
}
