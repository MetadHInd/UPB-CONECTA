import { describe, expect, it } from 'vitest';
import { ComputeManualCorrectionRate } from '../../src/contexts/classification/application/ComputeManualCorrectionRate.js';
import type { ClassificationResultRecord } from '../../src/contexts/classification/domain/entities/ClassificationResult.js';
import type { ClassificationCorrectionRecord } from '../../src/contexts/classification/domain/ports/out/ClassificationCorrectionRepositoryPort.js';
import { MessageCategory } from '../../src/contexts/classification/domain/value-objects/MessageCategory.js';

function record(messageId: string): ClassificationResultRecord {
  return {
    messageId,
    proposedCategory: MessageCategory.BOLETIN_INFORMATIVO,
    finalCategory: MessageCategory.BOLETIN_INFORMATIVO,
    isKnownFalsePositiveCase: false,
    reason: null,
    appliedRuleId: null,
    confidenceScore: 0.9,
    publicationStatus: 'published',
    persistedAt: new Date('2026-09-01T00:00:00Z')
  };
}

function correction(messageId: string, correctedAt: Date): ClassificationCorrectionRecord {
  return {
    messageId,
    proposedCategory: MessageCategory.BOLETIN_INFORMATIVO,
    previousFinalCategory: MessageCategory.BOLETIN_INFORMATIVO,
    correctedCategory: MessageCategory.PRACTICA,
    correctedAt
  };
}

describe('HU-11 — ComputeManualCorrectionRate (criterio 5)', () => {
  const useCase = new ComputeManualCorrectionRate();

  it('calcula la proporcion de documentos clasificados que se corrigieron a mano', () => {
    const classified = [record('m1'), record('m2'), record('m3'), record('m4')];
    const corrections = [correction('m1', new Date('2026-09-02T00:00:00Z'))];

    const result = useCase.execute(classified, corrections);

    expect(result).toEqual({ totalClassified: 4, manuallyCorrected: 1, rate: 0.25 });
  });

  it('una correccion repetida sobre el mismo documento cuenta una sola vez', () => {
    const classified = [record('m1'), record('m2')];
    const corrections = [
      correction('m1', new Date('2026-09-02T00:00:00Z')),
      correction('m1', new Date('2026-09-03T00:00:00Z'))
    ];

    const result = useCase.execute(classified, corrections);

    expect(result).toEqual({ totalClassified: 2, manuallyCorrected: 1, rate: 0.5 });
  });

  it('sin documentos clasificados, la tasa es null (no se afirma un porcentaje sin datos)', () => {
    const result = useCase.execute([], []);

    expect(result).toEqual({ totalClassified: 0, manuallyCorrected: 0, rate: null });
  });

  it('sin ninguna correccion, la tasa es 0', () => {
    const result = useCase.execute([record('m1'), record('m2')], []);

    expect(result).toEqual({ totalClassified: 2, manuallyCorrected: 0, rate: 0 });
  });
});
