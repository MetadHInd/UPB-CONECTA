import { randomUUID } from 'node:crypto';
import type { KnowledgeEntryIdGeneratorPort } from '../../../../domain/ports/out/KnowledgeEntryIdGeneratorPort.js';

export class RandomKnowledgeEntryIdGenerator implements KnowledgeEntryIdGeneratorPort {
  next(): string {
    return `kb-${randomUUID()}`;
  }
}
