import type { InstitutionalMessage } from '../../ingestion/domain/entities/InstitutionalMessage.js';
import { ClassificationResult, type PublicationStatus } from '../domain/entities/ClassificationResult.js';
import type { AdminAlertPort } from '../domain/ports/out/AdminAlertPort.js';
import type { ClassificationPort } from '../domain/ports/out/ClassificationPort.js';
import type { ClassificationResultRepositoryPort } from '../domain/ports/out/ClassificationResultRepositoryPort.js';
import type { ClassificationRetryQueuePort } from '../domain/ports/out/ClassificationRetryQueuePort.js';
import type { NotificationSchedulingPort } from '../domain/ports/out/NotificationSchedulingPort.js';
import type { PostProcessingRuleRepositoryPort } from '../domain/ports/out/PostProcessingRuleRepositoryPort.js';
import type { ReviewThresholdConfigPort } from '../domain/ports/out/ReviewThresholdConfigPort.js';
import { applyPostProcessingRules } from '../domain/rules/PostProcessingRuleChain.js';
import { decidePublicationStatus } from '../domain/services/PublicationDecisionPolicy.js';

export interface ClassifyInstitutionalMessageDependencies {
  readonly classificationPort: ClassificationPort;
  readonly resultRepository?: ClassificationResultRepositoryPort;
  readonly retryQueue?: ClassificationRetryQueuePort;
  /**
   * Opcional para no romper el flujo existente de HU-06: sin este puerto, el
   * caso de uso se comporta exactamente igual que antes de HU-09.
   */
  readonly ruleRepository?: PostProcessingRuleRepositoryPort;
  /**
   * HU-10. Opcionales por la misma razon: sin umbral configurado todo se
   * publica, como antes de esta historia.
   */
  readonly reviewThresholdConfig?: ReviewThresholdConfigPort;
  readonly adminAlertPort?: AdminAlertPort;
  readonly notificationSchedulingPort?: NotificationSchedulingPort;
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
        const publicationStatus = await this.resolvePublicationStatus(result);
        const record = result.toPersistedRecord(message.messageId.toString(), new Date(), publicationStatus);
        await this.deps.resultRepository.save(record);

        if (publicationStatus === 'pending-review') {
          await this.deps.adminAlertPort?.notifyPendingReview(record);
        } else {
          await this.deps.notificationSchedulingPort?.scheduleForPublication(record);
        }
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
   * HU-10, criterio 4: el umbral se lee en cada ejecucion (nunca cacheado),
   * para que un ajuste del administrador aplique a la siguiente
   * clasificacion sin redespliegue. La decision en si es politica de dominio
   * pura (`decidePublicationStatus`).
   */
  private async resolvePublicationStatus(result: ClassificationResult): Promise<PublicationStatus> {
    if (!this.deps.reviewThresholdConfig) {
      return 'published';
    }
    const threshold = await this.deps.reviewThresholdConfig.get();
    return decidePublicationStatus(result.confidenceScore, threshold);
  }

  /**
   * Aplica las reglas de posprocesamiento vigentes (RF-13, RF-14) sobre la
   * propuesta del clasificador. Las reglas se leen en cada ejecucion (nunca
   * cacheadas) para que un cambio de regla aplique sin redespliegue
   * (criterio 5). Devuelve null cuando una regla descarta la clasificacion:
   * en ese caso el mensaje se envia a la cola de reintento para revision
   * humana en vez de publicarse (ver README: decision sobre "descartar").
   *
   * Una regla cambia la categoria, no la confianza del modelo: el
   * `confidenceScore` original se conserva siempre (HU-10, criterio 7).
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
          appliedRuleId: outcome.appliedRuleId,
          confidenceScore: proposed.confidenceScore
        });

      case 'corrected':
        return ClassificationResult.fromCategory(proposed.proposedCategory, {
          finalCategory: outcome.category,
          isKnownFalsePositiveCase: proposed.isKnownFalsePositiveCase,
          reason: `Corregido por regla de posprocesamiento: ${outcome.appliedRuleId}`,
          appliedRuleId: outcome.appliedRuleId,
          confidenceScore: proposed.confidenceScore
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
