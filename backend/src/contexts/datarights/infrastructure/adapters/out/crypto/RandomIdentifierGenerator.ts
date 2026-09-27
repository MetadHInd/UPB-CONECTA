import { randomUUID } from 'node:crypto';
import type { IdentifierGeneratorPort } from '../../../../domain/ports/out/IdentifierGeneratorPort.js';

export class RandomIdentifierGenerator implements IdentifierGeneratorPort {
  newRequestId(): string {
    return randomUUID();
  }

  /** Aleatorio puro: no hay tabla ni funcion que lo relacione con el titular. */
  newPseudonym(): string {
    return `titular-suprimido-${randomUUID()}`;
  }
}
