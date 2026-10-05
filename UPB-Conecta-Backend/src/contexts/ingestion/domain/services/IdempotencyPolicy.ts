import type { RawInstitutionalMessage } from '../entities/RawInstitutionalMessage.js';
import type { ProcessedMessageRegistryPort } from '../ports/out/ProcessedMessageRegistryPort.js';

export type IdempotencyDecision =
  | { readonly kind: 'process' }
  | { readonly kind: 'discard-duplicate'; readonly reason: string };

/**
 * Politica de dominio que decide si un mensaje entra al flujo o se descarta.
 *
 * RF-02, criterios de aceptacion 3 y 4: ante una reejecucion sobre el mismo
 * lote no se genera ningun documento nuevo y cada mensaje se contabiliza como
 * duplicado, identificandolo por su encabezado unico.
 */
export class IdempotencyPolicy {
  constructor(private readonly registry: ProcessedMessageRegistryPort) {}

  async decide(message: RawInstitutionalMessage): Promise<IdempotencyDecision> {
    const alreadyProcessed = await this.registry.hasBeenProcessed(message.messageId);
    if (alreadyProcessed) {
      return {
        kind: 'discard-duplicate',
        reason: `El mensaje ${message.messageId.toString()} ya fue procesado en una ejecucion anterior`
      };
    }
    return { kind: 'process' };
  }
}
