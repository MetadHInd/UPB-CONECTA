import type { IngestionCursor } from '../../value-objects/IngestionCursor.js';
import type { RawInstitutionalMessage } from '../../entities/RawInstitutionalMessage.js';

/**
 * Puerto de salida hacia el buzon institucional recolector.
 *
 * Es la frontera declarada por Cockburn: un mismo puerto admite el adaptador
 * IMAP real y un adaptador en memoria que no depende de la presencia del buzon,
 * propiedad que sostiene la estrategia de pruebas de RNF-44.
 */
export interface MailboxIngestionPort {
  /**
   * Recupera los mensajes posteriores al punto de lectura, en orden ascendente
   * de uid y acotados por el tamano de lote configurado.
   */
  fetchUnprocessed(cursor: IngestionCursor, batchSize: number): Promise<RawInstitutionalMessage[]>;
}

export class MailboxUnavailableError extends Error {
  constructor(cause: string) {
    super(`El buzon institucional no responde: ${cause}`);
    this.name = 'MailboxUnavailableError';
  }
}
