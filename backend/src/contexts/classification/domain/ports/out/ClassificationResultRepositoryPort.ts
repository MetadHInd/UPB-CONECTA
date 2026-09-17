import type { ClassificationResultRecord } from '../../entities/ClassificationResult.js';

export interface ClassificationResultRepositoryPort {
  save(record: ClassificationResultRecord): Promise<void>;
}
