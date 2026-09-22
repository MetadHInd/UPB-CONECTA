import { randomUUID } from 'node:crypto';
import type { SessionIdGeneratorPort } from '../../../../domain/ports/out/SessionIdGeneratorPort.js';

/** UUID v4 con fuente criptografica: `jti` y `sid` no deben ser adivinables. */
export class RandomSessionIdGenerator implements SessionIdGeneratorPort {
  newId(): string {
    return randomUUID();
  }
}
