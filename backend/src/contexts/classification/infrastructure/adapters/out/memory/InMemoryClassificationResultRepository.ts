import type { ClassificationResultRecord } from '../../../../domain/entities/ClassificationResult.js';
import type { ClassificationResultRepositoryPort } from '../../../../domain/ports/out/ClassificationResultRepositoryPort.js';

export class InMemoryClassificationResultRepository implements ClassificationResultRepositoryPort {
  readonly items: ClassificationResultRecord[] = [];

  async save(record: ClassificationResultRecord): Promise<void> {
    const existingIndex = this.items.findIndex((item) => item.messageId === record.messageId);

    if (existingIndex >= 0) {
      this.items[existingIndex] = record;
      return;
    }

    this.items.push(record);
  }
}
