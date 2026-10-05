import { describe, expect, it } from 'vitest';
import type {
  ClassificationResultRecord,
  PublicationStatus
} from '../../src/contexts/classification/domain/entities/ClassificationResult.js';
import type { LabeledSample } from '../../src/contexts/classification/domain/ports/out/LabeledSampleRepositoryPort.js';
import { MessageCategory } from '../../src/contexts/classification/domain/value-objects/MessageCategory.js';
import { ComputeClassificationPrecision } from '../../src/contexts/classification/application/ComputeClassificationPrecision.js';
import { ComputeCoverageMetric } from '../../src/contexts/classification/application/ComputeCoverageMetric.js';
import { InMemoryLabeledSampleRepository } from '../../src/contexts/classification/infrastructure/adapters/out/memory/InMemoryLabeledSampleRepository.js';

const CONVOCATORIA = MessageCategory.CONVOCATORIA_CON_PLAZO;
const BOLETIN = MessageCategory.BOLETIN_INFORMATIVO;

// Fixtures sinteticas para verificar el mecanismo de calculo: NO son datos
// reales de un piloto (ver README de classification, HU-10, gap 3).
function record(
  messageId: string,
  finalCategory: MessageCategory,
  publicationStatus: PublicationStatus = 'published'
): ClassificationResultRecord {
  return {
    messageId,
    proposedCategory: finalCategory,
    finalCategory,
    isKnownFalsePositiveCase: false,
    reason: null,
    appliedRuleId: null,
    confidenceScore: publicationStatus === 'published' ? 0.9 : 0.3,
    publicationStatus,
    persistedAt: new Date('2026-09-01T00:00:00Z')
  };
}

function label(messageId: string, actualCategory: MessageCategory): LabeledSample {
  return { messageId, actualCategory };
}

describe('HU-10 — ComputeClassificationPrecision (criterio 5, RNF-25)', () => {
  const useCase = new ComputeClassificationPrecision();

  it('calcula la proporcion de publicados como convocatoria que realmente lo son', () => {
    const records = [
      record('m1', CONVOCATORIA),
      record('m2', CONVOCATORIA),
      record('m3', CONVOCATORIA),
      record('m4', CONVOCATORIA),
      record('m5', CONVOCATORIA)
    ];
    const sample = [
      label('m1', CONVOCATORIA),
      label('m2', CONVOCATORIA),
      label('m3', CONVOCATORIA),
      label('m4', CONVOCATORIA),
      label('m5', BOLETIN)
    ];

    const result = useCase.execute(records, sample, CONVOCATORIA);

    expect(result).toEqual({
      category: CONVOCATORIA,
      publishedWithLabel: 5,
      correct: 4,
      precision: 0.8,
      minimumPrecision: 0.8,
      meetsMinimum: true
    });
  });

  it('por debajo del 80% no cumple el minimo', () => {
    const records = [record('m1', CONVOCATORIA), record('m2', CONVOCATORIA), record('m3', CONVOCATORIA), record('m4', CONVOCATORIA)];
    const sample = [label('m1', CONVOCATORIA), label('m2', CONVOCATORIA), label('m3', CONVOCATORIA), label('m4', BOLETIN)];

    const result = useCase.execute(records, sample, CONVOCATORIA);

    expect(result.precision).toBe(0.75);
    expect(result.meetsMinimum).toBe(false);
  });

  it('ignora documentos en revision pendiente, de otra categoria o sin etiqueta humana', () => {
    const records = [
      record('m1', CONVOCATORIA),
      record('m2', CONVOCATORIA, 'pending-review'),
      record('m3', BOLETIN),
      record('m4', CONVOCATORIA)
    ];
    const sample = [label('m1', CONVOCATORIA), label('m2', BOLETIN), label('m3', CONVOCATORIA)];

    const result = useCase.execute(records, sample, CONVOCATORIA);

    expect(result.publishedWithLabel).toBe(1);
    expect(result.correct).toBe(1);
    expect(result.precision).toBe(1);
  });

  it('sin ningun documento evaluable no afirma que se cumple el minimo', () => {
    const result = useCase.execute([record('m1', CONVOCATORIA)], [], CONVOCATORIA);

    expect(result.precision).toBeNull();
    expect(result.meetsMinimum).toBe(false);
  });
});

describe('HU-10 — ComputeCoverageMetric (criterio 6, RNF-26)', () => {
  const useCase = new ComputeCoverageMetric();

  it('calcula la proporcion de convocatorias reales que fueron detectadas y publicadas', () => {
    const sample = Array.from({ length: 10 }, (_, index) => label(`m${index}`, CONVOCATORIA));
    const records = Array.from({ length: 9 }, (_, index) => record(`m${index}`, CONVOCATORIA));

    const result = useCase.execute(records, sample, CONVOCATORIA);

    expect(result).toEqual({
      category: CONVOCATORIA,
      actualInSample: 10,
      detectedAndPublished: 9,
      coverage: 0.9,
      minimumCoverage: 0.9,
      meetsMinimum: true
    });
  });

  it('una convocatoria retenida en revision, mal clasificada o sin clasificar no cuenta como detectada', () => {
    const sample = [
      label('ok', CONVOCATORIA),
      label('pendiente', CONVOCATORIA),
      label('mal-clasificada', CONVOCATORIA),
      label('sin-clasificar', CONVOCATORIA),
      label('boletin-real', BOLETIN)
    ];
    const records = [
      record('ok', CONVOCATORIA),
      record('pendiente', CONVOCATORIA, 'pending-review'),
      record('mal-clasificada', BOLETIN),
      record('boletin-real', BOLETIN)
    ];

    const result = useCase.execute(records, sample, CONVOCATORIA);

    expect(result.actualInSample).toBe(4);
    expect(result.detectedAndPublished).toBe(1);
    expect(result.coverage).toBe(0.25);
    expect(result.meetsMinimum).toBe(false);
  });

  it('sin convocatorias reales en la muestra, la cobertura no es calculable', () => {
    const result = useCase.execute([], [label('m1', BOLETIN)], CONVOCATORIA);

    expect(result.coverage).toBeNull();
    expect(result.meetsMinimum).toBe(false);
  });
});

describe('HU-10 — InMemoryLabeledSampleRepository', () => {
  it('guarda pares etiquetados y hace upsert por messageId', async () => {
    const repository = new InMemoryLabeledSampleRepository();

    await repository.save(label('m1', CONVOCATORIA));
    await repository.save(label('m1', BOLETIN));
    await repository.save(label('m2', CONVOCATORIA));

    expect(await repository.findAll()).toEqual([label('m1', BOLETIN), label('m2', CONVOCATORIA)]);
  });
});
