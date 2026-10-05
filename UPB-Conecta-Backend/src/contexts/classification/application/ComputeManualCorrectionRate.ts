import type { ClassificationResultRecord } from '../domain/entities/ClassificationResult.js';
import type { ClassificationCorrectionRecord } from '../domain/ports/out/ClassificationCorrectionRepositoryPort.js';

export interface ManualCorrectionRateResult {
  readonly totalClassified: number;
  /** Documentos distintos con al menos una correccion manual (no cuenta correcciones repetidas del mismo documento). */
  readonly manuallyCorrected: number;
  /** manuallyCorrected / totalClassified, o null sin documentos clasificados. */
  readonly rate: number | null;
}

/**
 * HU-11, criterio 5 (indicador de degradacion del clasificador): que
 * proporcion de los documentos clasificados tuvo que corregirse a mano.
 *
 * Caso de uso puro, mismo estilo que `ComputeClassificationPrecision` y
 * `ComputeCoverageMetric` (HU-10): recibe los datos ya cargados y no hace
 * I/O. Cuenta documentos distintos, no eventos de correccion — un documento
 * corregido dos veces sigue siendo un solo documento que necesito corregir,
 * no dos.
 */
export class ComputeManualCorrectionRate {
  execute(
    classified: readonly ClassificationResultRecord[],
    corrections: readonly ClassificationCorrectionRecord[]
  ): ManualCorrectionRateResult {
    const totalClassified = classified.length;
    const correctedMessageIds = new Set(corrections.map((correction) => correction.messageId));

    return {
      totalClassified,
      manuallyCorrected: correctedMessageIds.size,
      rate: totalClassified === 0 ? null : correctedMessageIds.size / totalClassified
    };
  }
}
