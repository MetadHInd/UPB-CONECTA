import type { InstitutionalMessage } from '../../../../ingestion/domain/entities/InstitutionalMessage.js';

export interface ClassificationRetryEntry {
  readonly messageId: string;
  readonly message: InstitutionalMessage;
  readonly error: string;
  readonly createdAt: Date;
}

export interface ClassificationRetryQueuePort {
  save(entry: ClassificationRetryEntry): Promise<void>;
}
