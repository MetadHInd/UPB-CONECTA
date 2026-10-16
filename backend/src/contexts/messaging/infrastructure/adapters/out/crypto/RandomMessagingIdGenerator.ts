import { randomUUID } from 'node:crypto';
import type { MessagingIdGeneratorPort } from '../../../../domain/ports/out/MessagingIdGeneratorPort.js';

export class RandomMessagingIdGenerator implements MessagingIdGeneratorPort {
  newId(): string {
    return randomUUID();
  }
}
