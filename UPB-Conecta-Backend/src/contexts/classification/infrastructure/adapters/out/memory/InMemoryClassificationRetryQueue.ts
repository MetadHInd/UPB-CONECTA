import type { ClassificationRetryEntry, ClassificationRetryQueuePort } from '../../../../domain/ports/out/ClassificationRetryQueuePort.js';

export class InMemoryClassificationRetryQueue implements ClassificationRetryQueuePort {
  readonly items: ClassificationRetryEntry[] = [];

  /** Misma semantica que el adaptador Mongo: upsert por messageId, conserva el primer createdAt. */
  async save(entry: ClassificationRetryEntry): Promise<void> {
    const index = this.items.findIndex((item) => item.messageId === entry.messageId);
    const existing = this.items[index];
    if (existing) {
      this.items[index] = { ...entry, createdAt: existing.createdAt };
      return;
    }
    this.items.push(entry);
  }

  async contains(messageId: string): Promise<boolean> {
    return this.items.some((item) => item.messageId === messageId);
  }
}
