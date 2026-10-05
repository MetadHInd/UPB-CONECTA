import { randomUUID } from 'node:crypto';
import type { ManualMessageIdGeneratorPort } from '../../../../domain/ports/out/ManualMessageIdGeneratorPort.js';

/** Mismo esquema que `MessageId.fromHeader` exige (incluye `@`), fuente criptografica para no ser adivinable. */
export class RandomManualMessageIdGenerator implements ManualMessageIdGeneratorPort {
  newMessageId(): string {
    return `manual-${randomUUID()}@upb-conecta.local`;
  }
}
