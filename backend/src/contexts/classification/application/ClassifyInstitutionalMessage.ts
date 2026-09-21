import type { InstitutionalMessage } from '../../ingestion/domain/entities/InstitutionalMessage.js';
import { ClassificationResult } from '../domain/entities/ClassificationResult.js';
import type { ClassificationPort } from '../domain/ports/out/ClassificationPort.js';
import type { ClassificationResultRepositoryPort } from '../domain/ports/out/ClassificationResultRepositoryPort.js';
import type { ClassificationRetryQueuePort } from '../domain/ports/out/ClassificationRetryQueuePort.js';
import type { PostProcessingRuleRepositoryPort } from '../domain/ports/out/PostProcessingRuleRepositoryPort.js';
import { applyPostProcessingRules } from '../domain/rules/PostProcessingRuleChain.js';

export interface ClassifyInstitutionalMessageDependencies {
  readonly classificationPort: ClassificationPort;
  readonly resultRepository?: ClassificationResultRepositoryPort;
  readonly retryQueue?: ClassificationRetryQueuePort;
  /**
   * Opcional para no romper el flujo existente de HU-06: sin este puerto, el
   * caso de uso se comporta exactamente igual que antes de HU-09.
   */
  readonly ruleRepository?: PostProcessingRuleRepositoryPort;
}

export class ClassifyInstitutionalMessage {
  constructor(private readonly deps: ClassifyInstitutionalMessageDependencies) {}

  async execute(message: InstitutionalMessage): Promise<ClassificationResult | null> {
    try {
      const proposed = await this.deps.classificationPort.classify(message);
      const result = await this.applyPostProcessing(proposed, message);

      if (result === null) {
        return null;
      }

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

  /**
   * Aplica las reglas de posprocesamiento vigentes (RF-13, RF-14) sobre la
   * propuesta del clasificador. Las reglas se leen en cada ejecucion (nunca
   * cacheadas) para que un cambio de regla aplique sin redespliegue
   * (criterio 5). Devuelve null cuando una regla descarta la clasificacion:
   * en ese caso el mensaje se envia a la cola de reintento para revision
   * humana en vez de publicarse (ver README: decision sobre "descartar").
   */
  private async applyPostProcessing(
    proposed: ClassificationResult,
    message: InstitutionalMessage
  ): Promise<ClassificationResult | null> {
    if (!this.deps.ruleRepository) {
      return proposed;
    }

    const rules = await this.deps.ruleRepository.findActiveRules();
    const outcome = applyPostProcessingRules(rules, message);

    switch (outcome.kind) {
      case 'no-rule-applied':
        return proposed;

      case 'confirmed':
        return ClassificationResult.fromCategory(proposed.proposedCategory, {
          finalCategory: proposed.proposedCategory,
          isKnownFalsePositiveCase: proposed.isKnownFalsePositiveCase,
          reason: proposed.reason,
          appliedRuleId: outcome.appliedRuleId
        });

      case 'corrected':
        return ClassificationResult.fromCategory(proposed.proposedCategory, {
          finalCategory: outcome.category,
          isKnownFalsePositiveCase: proposed.isKnownFalsePositiveCase,
          reason: `Corregido por regla de posprocesamiento: ${outcome.appliedRuleId}`,
          appliedRuleId: outcome.appliedRuleId
        });

      case 'discarded':
        if (this.deps.retryQueue) {
          await this.deps.retryQueue.save({
            messageId: message.messageId.toString(),
            message,
            error: `Descartado por regla de posprocesamiento: ${outcome.appliedRuleId}`,
            createdAt: new Date(),
            discardedByRuleId: outcome.appliedRuleId,
            proposedCategory: proposed.proposedCategory
          });
        }
        return null;
    }
  }
}
