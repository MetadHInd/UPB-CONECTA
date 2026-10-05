import type { InstitutionalMessage } from '../entities/InstitutionalMessage.js';
import type {
  ConsolidatedMessageRecord,
  ConsolidatedMessageRegistryPort
} from '../ports/out/ConsolidatedMessageRegistryPort.js';

export type DeduplicationDecision =
  | { readonly kind: 'new' }
  | { readonly kind: 'consolidate'; readonly existing: ConsolidatedMessageRecord }
  | { readonly kind: 'update-body'; readonly existing: ConsolidatedMessageRecord };

/**
 * Politica de dominio para HU-03 (RF-05, CU-01 paso 5): deduplicacion
 * semantica por remitente+asunto dentro de una ventana temporal.
 *
 * Es deliberadamente distinta de `IdempotencyPolicy`: esa evita reprocesar el
 * mismo `Message-ID`; esta agrupa reenvios institucionales que llegan con
 * `Message-ID` propio (recordatorios, reenvios manuales de una convocatoria).
 *
 * La ventana es movil (ancla en el ultimo envio visto, no en el primero): un
 * reenvio institucional tipico es una cadena de recordatorios periodicos
 * sobre la misma convocatoria, y anclar al primer envio cortaria la cadena en
 * cuanto pasara la primera ventana aunque los recordatorios siguieran
 * llegando con intervalos cortos entre si.
 */
export class DeduplicationPolicy {
  constructor(private readonly registry: ConsolidatedMessageRegistryPort) {}

  async decide(message: InstitutionalMessage, windowMs: number): Promise<DeduplicationDecision> {
    const existing = await this.registry.findWithinWindow(
      message.sender,
      message.subject,
      message.sentAt,
      windowMs
    );

    if (existing === null) {
      return { kind: 'new' };
    }

    if (existing.body !== message.body) {
      return { kind: 'update-body', existing };
    }

    return { kind: 'consolidate', existing };
  }
}
