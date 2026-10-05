import type { InstitutionalMessage } from '../../ingestion/domain/entities/InstitutionalMessage.js';
import type { ClassificationResultRecord } from '../domain/entities/ClassificationResult.js';
import type { MessageCategory } from '../domain/value-objects/MessageCategory.js';
import type { PostProcessingRuleData } from '../domain/rules/PostProcessingRuleData.js';
import { buildSpecification } from '../domain/rules/RuleConditionSpecification.js';

/**
 * Un elemento del historico etiquetado sobre el que se simula. La historia de
 * usuario (criterio 6) habla de simular sobre "el historico etiquetado", pero
 * un `ClassificationResultRecord` no conserva `sender`/`subject` (ese dato
 * vive en `InstitutionalMessage`, fuera de este contexto) y la condicion de
 * una regla necesita justamente esos campos. Por eso esta entrada empareja
 * cada registro historico con el mensaje que lo origino — extension necesaria
 * y documentada en el README de este contexto, no un tercer estado ambiguo.
 */
export interface LabeledHistoricalMessage {
  readonly message: InstitutionalMessage;
  readonly record: ClassificationResultRecord;
}

export interface PostProcessingSimulationDiff {
  readonly messageId: string;
  readonly historicalFinalCategory: MessageCategory;
  readonly simulatedOutcome: 'confirmed' | 'corrected' | 'discarded';
  readonly simulatedFinalCategory: MessageCategory | null;
  readonly wouldChange: boolean;
}

export interface PostProcessingSimulationResult {
  readonly totalEvaluated: number;
  readonly totalMatched: number;
  readonly totalChanged: number;
  readonly diffs: readonly PostProcessingSimulationDiff[];
}

/**
 * Caso de uso de solo lectura (RF-13, criterio 6): antes de activar una regla
 * candidata (no necesariamente ya guardada), muestra que habria cambiado si
 * ya hubiera estado activa sobre un historico ya etiquetado. No persiste
 * nada, no llama a ningun repositorio y no muta sus argumentos: es una
 * funcion pura sobre los datos que recibe.
 *
 * Simula el efecto de esa unica regla en aislamiento, no de la cadena
 * completa junto a otras reglas activas — tal como lo describe la historia
 * ("simular su efecto" sobre una regla candidata, en singular). Simular el
 * impacto de insertar la regla dentro de la cadena vigente (donde una regla
 * de mayor precedencia podria interceptar el mensaje antes) queda fuera de
 * este alcance.
 */
export class SimulatePostProcessingRule {
  execute(
    candidate: PostProcessingRuleData,
    history: readonly LabeledHistoricalMessage[]
  ): PostProcessingSimulationResult {
    const specification = buildSpecification(candidate.condition);
    const diffs: PostProcessingSimulationDiff[] = [];

    for (const entry of history) {
      if (!specification.isSatisfiedBy(entry.message)) {
        continue;
      }

      diffs.push(this.simulateAction(candidate, entry.record));
    }

    return {
      totalEvaluated: history.length,
      totalMatched: diffs.length,
      totalChanged: diffs.filter((diff) => diff.wouldChange).length,
      diffs
    };
  }

  private simulateAction(
    rule: PostProcessingRuleData,
    record: ClassificationResultRecord
  ): PostProcessingSimulationDiff {
    const messageId = record.messageId;
    const historicalFinalCategory = record.finalCategory;

    switch (rule.action.type) {
      case 'confirm':
        return {
          messageId,
          historicalFinalCategory,
          simulatedOutcome: 'confirmed',
          simulatedFinalCategory: record.proposedCategory,
          wouldChange: record.proposedCategory !== record.finalCategory
        };
      case 'correct':
        return {
          messageId,
          historicalFinalCategory,
          simulatedOutcome: 'corrected',
          simulatedFinalCategory: rule.action.category,
          wouldChange: rule.action.category !== record.finalCategory
        };
      case 'discard':
        return {
          messageId,
          historicalFinalCategory,
          simulatedOutcome: 'discarded',
          simulatedFinalCategory: null,
          wouldChange: true
        };
    }
  }
}
