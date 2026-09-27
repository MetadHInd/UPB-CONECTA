import { randomUUID } from 'node:crypto';
import type { ManualMessageIdGeneratorPort } from '../../../../domain/ports/out/ManualMessageIdGeneratorPort.js';

/**
 * Mismo esquema que `MessageId.fromHeader` exige (incluye `@`), fuente
 * criptografica para no ser adivinable. HU-22: el id no lleva un prefijo que
 * delate el origen (antes `manual-`); el listado lo expone como `offerId` y
 * el usuario no debe distinguir una oferta cargada a mano de una ingerida.
 * Los ids ya emitidos con el prefijo anterior siguen siendo validos.
 */
export class RandomManualMessageIdGenerator implements ManualMessageIdGeneratorPort {
  newMessageId(): string {
    return `${randomUUID()}@upb-conecta.local`;
  }
}
