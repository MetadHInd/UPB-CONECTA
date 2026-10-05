import type { ClassificationResultRecord } from '../domain/entities/ClassificationResult.js';
import type { LabeledSample } from '../domain/ports/out/LabeledSampleRepositoryPort.js';
import type { MessageCategory } from '../domain/value-objects/MessageCategory.js';

export interface PrecisionMetricResult {
  readonly category: MessageCategory;
  /** Documentos publicados con esta categoria que ademas tienen etiqueta humana. */
  readonly publishedWithLabel: number;
  /** De esos, cuantos tienen como etiqueta real esa misma categoria. */
  readonly correct: number;
  /** correct / publishedWithLabel, o null si no hay ningun documento evaluable. */
  readonly precision: number | null;
  readonly minimumPrecision: number;
  readonly meetsMinimum: boolean;
}

/**
 * HU-10, criterio 5 (RNF-25): "al menos el 80% de los documentos publicados
 * como convocatoria con plazo corresponden efectivamente a esa categoria".
 *
 * Caso de uso puro: recibe los datos ya cargados (registros de clasificacion
 * y muestra etiquetada) y devuelve el porcentaje, sin I/O. Solo cuentan los
 * documentos con `publicationStatus === 'published'` (los retenidos en
 * revision no se publicaron) y que ademas aparecen en la muestra etiquetada
 * — un documento publicado sin etiqueta humana no puede contar ni a favor ni
 * en contra. Sin ningun documento evaluable, `precision` es null y
 * `meetsMinimum` es false: no se puede afirmar que el umbral se cumple.
 */
export class ComputeClassificationPrecision {
  execute(
    records: readonly ClassificationResultRecord[],
    labeledSample: readonly LabeledSample[],
    category: MessageCategory,
    minimumPrecision = 0.8
  ): PrecisionMetricResult {
    const actualByMessageId = new Map(labeledSample.map((sample) => [sample.messageId, sample.actualCategory]));

    const publishedWithLabel = records.filter(
      (record) =>
        record.publicationStatus === 'published' &&
        record.finalCategory === category &&
        actualByMessageId.has(record.messageId)
    );
    const correct = publishedWithLabel.filter((record) => actualByMessageId.get(record.messageId) === category);
    const precision = publishedWithLabel.length === 0 ? null : correct.length / publishedWithLabel.length;

    return {
      category,
      publishedWithLabel: publishedWithLabel.length,
      correct: correct.length,
      precision,
      minimumPrecision,
      meetsMinimum: precision !== null && precision >= minimumPrecision
    };
  }
}
