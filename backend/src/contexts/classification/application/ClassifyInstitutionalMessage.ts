import type { InstitutionalMessage } from '../../ingestion/domain/entities/InstitutionalMessage.js';
import type { ClassificationResult } from '../domain/entities/ClassificationResult.js';
import type { ClassificationPort } from '../domain/ports/out/ClassificationPort.js';
import type { ClassificationResultRepositoryPort } from '../domain/ports/out/ClassificationResultRepositoryPort.js';
import type { ClassificationRetryQueuePort } from '../domain/ports/out/ClassificationRetryQueuePort.js';

export interface ClassifyInstitutionalMessageDependencies {
  readonly classificationPort: ClassificationPort;
  readonly resultRepository?: ClassificationResultRepositoryPort;
  readonly retryQueue?: ClassificationRetryQueuePort;
}

export class ClassifyInstitutionalMessage {
  constructor(private readonly deps: ClassifyInstitutionalMessageDependencies) {}

  async execute(message: InstitutionalMessage): Promise<ClassificationResult | null> {
    try {
      const result = await this.deps.classificationPort.classify(message);

      if (this.deps.resultRepository) {
        await this.deps.resultRepository.save(
          result.toPersistedRecord(message.messageId.toString(), new Date())
        );
      }

      return result;
    } catch (error) {
      const cause = error instanceof Error ? error.message : String(error);

      if (this.deps.retryQueue) {
        await this.deps.retryQueue.save({
          messageId: message.messageId.toString(),
          message,
          error: cause,
          createdAt: new Date()
        });
      }

      return null;
    }
  }
}
