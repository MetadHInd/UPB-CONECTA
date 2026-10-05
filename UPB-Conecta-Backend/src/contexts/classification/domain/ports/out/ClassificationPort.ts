import type { InstitutionalMessage } from '../../../../ingestion/domain/entities/InstitutionalMessage.js';
import type { ClassificationResult } from '../../entities/ClassificationResult.js';

export interface ClassificationPort {
  classify(message: InstitutionalMessage): Promise<ClassificationResult>;
}
