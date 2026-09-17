import type { ClassificationRetryEntry, ClassificationRetryQueuePort } from '../../../../domain/ports/out/ClassificationRetryQueuePort.js';

export class InMemoryClassificationRetryQueue implements ClassificationRetryQueuePort {
  readonly items: ClassificationRetryEntry[] = [];

  async save(entry: ClassificationRetryEntry): Promise<void> {
    this.items.push(entry);
  }
}
