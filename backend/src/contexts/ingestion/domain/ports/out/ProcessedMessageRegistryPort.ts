import type { MessageId } from '../../value-objects/MessageId.js';

/**
 * Registro de mensajes ya procesados.
 *
 * La idempotencia se garantiza consultando este registro desde el dominio y no
 * delegandola a una restriccion unica del motor de persistencia, de modo que la
 * regla siga siendo verificable sin base de datos.
 */
export interface ProcessedMessageRegistryPort {
  hasBeenProcessed(messageId: MessageId): Promise<boolean>;
  markAsProcessed(messageId: MessageId, mailboxUid: number, processedAt: Date): Promise<void>;
}
