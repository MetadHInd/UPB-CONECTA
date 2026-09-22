import { randomUUID } from 'node:crypto';
import type { ForumIdGeneratorPort } from '../../../../domain/ports/out/ForumIdGeneratorPort.js';

export class RandomForumIdGenerator implements ForumIdGeneratorPort {
  newId(): string {
    return randomUUID();
  }
}
