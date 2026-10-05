import type {
  ClassificationCorrectionRecord,
  ClassificationCorrectionRepositoryPort
} from '../../../../domain/ports/out/ClassificationCorrectionRepositoryPort.js';

export class InMemoryClassificationCorrectionRepository implements ClassificationCorrectionRepositoryPort {
  private readonly records: ClassificationCorrectionRecord[] = [];

  async save(record: ClassificationCorrectionRecord): Promise<void> {
    this.records.push(record);
  }

  async findAll(): Promise<readonly ClassificationCorrectionRecord[]> {
    return [...this.records];
  }
}
