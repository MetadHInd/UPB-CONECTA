import type { ClassificationResultRecord } from '../domain/entities/ClassificationResult.js';
import type { LabeledSample } from '../domain/ports/out/LabeledSampleRepositoryPort.js';
import type { MessageCategory } from '../domain/value-objects/MessageCategory.js';

export interface CoverageMetricResult {
  readonly category: MessageCategory;
  /** Documentos que, segun la muestra etiquetada, pertenecen realmente a la categoria. */
  readonly actualInSample: number;
  /** De esos, cuantos se clasificaron con esa categoria y se publicaron. */
  readonly detectedAndPublished: number;
  /** detectedAndPublished / actualInSample, o null si la muestra no tiene ninguno. */
  readonly coverage: number | null;
  readonly minimumCoverage: number;
  readonly meetsMinimum: boolean;
}

/**
 * HU-10, criterio 6 (RNF-26): "al menos el 90% de las convocatorias con
 * plazo presentes en el buzon fueron detectadas y publicadas".
 *
 * Caso de uso puro, igual que `ComputeClassificationPrecision`. El universo
 * es la muestra etiquetada del periodo de validacion (lo que realmente habia
 * en el buzon); un documento cuenta como detectado solo si tiene registro de
 * clasificacion con esa categoria final Y quedo publicado — uno retenido en
 * revision pendiente o sin clasificar no llego al estudiante.
 */
export class ComputeCoverageMetric {
  execute(
    records: readonly ClassificationResultRecord[],
    labeledSample: readonly LabeledSample[],
    category: MessageCategory,
    minimumCoverage = 0.9
  ): CoverageMetricResult {
    const recordByMessageId = new Map(records.map((record) => [record.messageId, record]));

    const actualInCategory = labeledSample.filter((sample) => sample.actualCategory === category);
    const detectedAndPublished = actualInCategory.filter((sample) => {
      const record = recordByMessageId.get(sample.messageId);
      return record !== undefined && record.publicationStatus === 'published' && record.finalCategory === category;
    });
    const coverage = actualInCategory.length === 0 ? null : detectedAndPublished.length / actualInCategory.length;

    return {
      category,
      actualInSample: actualInCategory.length,
      detectedAndPublished: detectedAndPublished.length,
      coverage,
      minimumCoverage,
      meetsMinimum: coverage !== null && coverage >= minimumCoverage
    };
  }
}
