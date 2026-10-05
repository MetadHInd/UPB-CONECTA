import { describe, expect, it } from 'vitest';
import { GetOperationsDashboard } from '../../src/contexts/metrics/application/GetOperationsDashboard.js';
import { FixedClock } from '../../src/contexts/metrics/infrastructure/adapters/out/memory/SystemClock.js';
import { InMemoryClassificationResultRepository } from '../../src/contexts/classification/infrastructure/adapters/out/memory/InMemoryClassificationResultRepository.js';
import { InMemoryQuarantineRepository } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryQuarantineRepository.js';
import { InMemoryClassificationCorrectionRepository } from '../../src/contexts/classification/infrastructure/adapters/out/memory/InMemoryClassificationCorrectionRepository.js';
import { InMemoryLabeledSampleRepository } from '../../src/contexts/classification/infrastructure/adapters/out/memory/InMemoryLabeledSampleRepository.js';
import { MessageCategory } from '../../src/contexts/classification/domain/value-objects/MessageCategory.js';
import type { ClassificationResultRecord, PublicationStatus } from '../../src/contexts/classification/domain/entities/ClassificationResult.js';
import type { ClassificationCorrectionRecord } from '../../src/contexts/classification/domain/ports/out/ClassificationCorrectionRepositoryPort.js';
import type { QuarantinedMessage } from '../../src/contexts/ingestion/domain/entities/QuarantinedMessage.js';

const NOW = new Date('2026-09-25T12:00:00Z');
const CONVOCATORIA = MessageCategory.CONVOCATORIA_CON_PLAZO;
const BOLETIN = MessageCategory.BOLETIN_INFORMATIVO;

function record(
  messageId: string,
  overrides: Partial<ClassificationResultRecord> & { finalCategory?: MessageCategory; publicationStatus?: PublicationStatus } = {}
): ClassificationResultRecord {
  return {
    messageId,
    proposedCategory: CONVOCATORIA,
    finalCategory: CONVOCATORIA,
    isKnownFalsePositiveCase: false,
    reason: null,
    appliedRuleId: null,
    confidenceScore: 0.9,
    publicationStatus: 'published',
    persistedAt: new Date('2026-09-10T00:00:00Z'),
    ...overrides
  };
}

function quarantined(mailboxUid: number, quarantinedAt: Date): QuarantinedMessage {
  return { mailboxUid, cause: 'sin Message-ID', rawSource: 'crudo', quarantinedAt };
}

function correction(messageId: string, correctedAt: Date): ClassificationCorrectionRecord {
  return {
    messageId,
    proposedCategory: BOLETIN,
    previousFinalCategory: BOLETIN,
    correctedCategory: CONVOCATORIA,
    correctedAt
  };
}

function buildUseCase() {
  const classificationResultRepo = new InMemoryClassificationResultRepository();
  const quarantineRepo = new InMemoryQuarantineRepository();
  const correctionRepo = new InMemoryClassificationCorrectionRepository();
  const labeledSampleRepo = new InMemoryLabeledSampleRepository();
  const clock = new FixedClock(NOW);
  const useCase = new GetOperationsDashboard({ classificationResultRepo, quarantineRepo, correctionRepo, labeledSampleRepo, clock });
  return { useCase, classificationResultRepo, quarantineRepo, correctionRepo, labeledSampleRepo };
}

const SEPTEMBER = { from: new Date('2026-09-01T00:00:00Z'), to: new Date('2026-09-30T23:59:59Z') };

describe('HU-51 — GetOperationsDashboard', () => {
  it('criterio 1: expone el volumen de mensajes ingeridos (clasificados + cuarentena) del periodo', async () => {
    const { useCase, classificationResultRepo, quarantineRepo } = buildUseCase();
    await classificationResultRepo.save(record('m1'));
    await classificationResultRepo.save(record('m2'));
    await quarantineRepo.save(quarantined(1, new Date('2026-09-05T00:00:00Z')));

    const dashboard = await useCase.execute(SEPTEMBER);

    expect(dashboard.volume).toEqual({ classified: 2, quarantined: 1, total: 3 });
  });

  it('criterio 2: expone la proporcion de mensajes en cuarentena sobre el total ingerido', async () => {
    const { useCase, classificationResultRepo, quarantineRepo } = buildUseCase();
    await classificationResultRepo.save(record('m1'));
    await classificationResultRepo.save(record('m2'));
    await classificationResultRepo.save(record('m3'));
    await quarantineRepo.save(quarantined(1, new Date('2026-09-05T00:00:00Z')));

    const dashboard = await useCase.execute(SEPTEMBER);

    expect(dashboard.quarantine).toEqual({ quarantined: 1, total: 4, proportion: 0.25 });
  });

  it('criterio 3: expone la tasa de correcciones manuales sobre las clasificaciones publicadas del periodo', async () => {
    const { useCase, classificationResultRepo, correctionRepo } = buildUseCase();
    await classificationResultRepo.save(record('m1'));
    await classificationResultRepo.save(record('m2'));
    await correctionRepo.save(correction('m1', new Date('2026-09-11T00:00:00Z')));

    const dashboard = await useCase.execute(SEPTEMBER);

    expect(dashboard.manualCorrectionRate).toEqual({ totalClassified: 2, manuallyCorrected: 1, rate: 0.5 });
  });

  it('criterio 4: expone precision y cobertura de convocatoria con plazo frente a su umbral objetivo', async () => {
    const { useCase, classificationResultRepo, labeledSampleRepo } = buildUseCase();
    for (let i = 0; i < 10; i += 1) {
      await classificationResultRepo.save(record(`m${i}`));
    }
    for (let i = 0; i < 10; i += 1) {
      await labeledSampleRepo.save({ messageId: `m${i}`, actualCategory: CONVOCATORIA });
    }

    const dashboard = await useCase.execute(SEPTEMBER);

    expect(dashboard.precision).toEqual({
      category: CONVOCATORIA,
      publishedWithLabel: 10,
      correct: 10,
      precision: 1,
      minimumPrecision: 0.8,
      meetsMinimum: true
    });
    expect(dashboard.coverage).toEqual({
      category: CONVOCATORIA,
      actualInSample: 10,
      detectedAndPublished: 10,
      coverage: 1,
      minimumCoverage: 0.9,
      meetsMinimum: true
    });
  });

  it('criterio 5: cambiar el periodo recalcula las metricas sobre el nuevo rango', async () => {
    const { useCase, classificationResultRepo } = buildUseCase();
    await classificationResultRepo.save(record('sept', { persistedAt: new Date('2026-09-10T00:00:00Z') }));
    await classificationResultRepo.save(record('oct', { persistedAt: new Date('2026-10-10T00:00:00Z') }));

    const september = await useCase.execute(SEPTEMBER);
    const october = await useCase.execute({ from: new Date('2026-10-01T00:00:00Z'), to: new Date('2026-10-31T23:59:59Z') });

    expect(september.volume.classified).toBe(1);
    expect(october.volume.classified).toBe(1);
    // Distintos documentos: si compartieran resultado, algo estaria filtrando mal por fecha.
    expect(september.precision.publishedWithLabel).toBe(0);
  });

  it('criterio 6: una metrica que supera su umbral objetivo se resalta como alerta', async () => {
    const { useCase, classificationResultRepo, quarantineRepo } = buildUseCase();
    await classificationResultRepo.save(record('m1'));
    for (let i = 0; i < 4; i += 1) {
      await quarantineRepo.save(quarantined(i, new Date('2026-09-05T00:00:00Z')));
    }
    // 4 en cuarentena / 5 totales = 0.8, muy por encima del techo por defecto (0.2).

    const dashboard = await useCase.execute(SEPTEMBER);

    const quarantineAlert = dashboard.alerts.find((alert) => alert.metric === 'proporcionCuarentena');
    expect(quarantineAlert?.status).toBe('alerta');
    expect(quarantineAlert?.value).toBe(0.8);
  });

  it('criterio 6: una metrica dentro del umbral objetivo no se marca como alerta', async () => {
    const { useCase, classificationResultRepo } = buildUseCase();
    for (let i = 0; i < 10; i += 1) {
      await classificationResultRepo.save(record(`m${i}`));
    }

    const dashboard = await useCase.execute(SEPTEMBER);

    const correctionAlert = dashboard.alerts.find((alert) => alert.metric === 'tasaCorreccionManual');
    expect(correctionAlert?.status).toBe('normal');
    expect(correctionAlert?.value).toBe(0);
  });

  it('umbral exactamente en el limite no genera alerta (limite exacto cumple el objetivo)', async () => {
    const { useCase, classificationResultRepo, quarantineRepo } = buildUseCase();
    // 20% en cuarentena exacto: 2 en cuarentena, 8 clasificados, total 10.
    for (let i = 0; i < 8; i += 1) {
      await classificationResultRepo.save(record(`m${i}`));
    }
    await quarantineRepo.save(quarantined(1, new Date('2026-09-05T00:00:00Z')));
    await quarantineRepo.save(quarantined(2, new Date('2026-09-06T00:00:00Z')));

    const dashboard = await useCase.execute(SEPTEMBER);

    expect(dashboard.quarantine.proportion).toBe(0.2);
    const quarantineAlert = dashboard.alerts.find((alert) => alert.metric === 'proporcionCuarentena');
    expect(quarantineAlert?.status).toBe('normal');
  });

  it('umbrales personalizados sobreescriben los valores por defecto', async () => {
    const { useCase, classificationResultRepo, quarantineRepo } = buildUseCase();
    await classificationResultRepo.save(record('m1'));
    await quarantineRepo.save(quarantined(1, new Date('2026-09-05T00:00:00Z')));
    // proporcion = 0.5, por encima del umbral por defecto (0.2) y tambien del personalizado (0.4).

    const dashboard = await useCase.execute({ ...SEPTEMBER, thresholds: { maximumQuarantineProportion: 0.6 } });

    const quarantineAlert = dashboard.alerts.find((alert) => alert.metric === 'proporcionCuarentena');
    expect(quarantineAlert?.threshold).toBe(0.6);
    expect(quarantineAlert?.status).toBe('normal');
  });

  it('periodo vacio (sin mensajes ingeridos): todas las metricas quedan sin datos, sin alertas falsas', async () => {
    const { useCase } = buildUseCase();

    const dashboard = await useCase.execute(SEPTEMBER);

    expect(dashboard.volume).toEqual({ classified: 0, quarantined: 0, total: 0 });
    expect(dashboard.quarantine.proportion).toBeNull();
    expect(dashboard.manualCorrectionRate.rate).toBeNull();
    expect(dashboard.precision.precision).toBeNull();
    expect(dashboard.coverage.coverage).toBeNull();
    expect(dashboard.alerts.every((alert) => alert.status === 'sin-datos')).toBe(true);
  });

  it('sin muestra etiquetada, precision y cobertura quedan sin datos (no se afirma un porcentaje)', async () => {
    const { useCase, classificationResultRepo } = buildUseCase();
    await classificationResultRepo.save(record('m1'));

    const dashboard = await useCase.execute(SEPTEMBER);

    expect(dashboard.precision.precision).toBeNull();
    expect(dashboard.coverage.coverage).toBeNull();
    expect(dashboard.alerts.find((alert) => alert.metric === 'precision')?.status).toBe('sin-datos');
    expect(dashboard.alerts.find((alert) => alert.metric === 'cobertura')?.status).toBe('sin-datos');
  });

  it('cero mensajes ingeridos en el periodo, pero con actividad fuera de rango: el periodo elegido manda', async () => {
    const { useCase, classificationResultRepo, quarantineRepo } = buildUseCase();
    await classificationResultRepo.save(record('fuera-de-rango', { persistedAt: new Date('2026-08-15T00:00:00Z') }));
    await quarantineRepo.save(quarantined(1, new Date('2026-08-15T00:00:00Z')));

    const dashboard = await useCase.execute(SEPTEMBER);

    expect(dashboard.volume).toEqual({ classified: 0, quarantined: 0, total: 0 });
  });

  it('una muestra etiquetada cuyo registro de clasificacion cae fuera del periodo no participa en precision/cobertura de ese periodo', async () => {
    const { useCase, classificationResultRepo, labeledSampleRepo } = buildUseCase();
    await classificationResultRepo.save(record('m1', { persistedAt: new Date('2026-08-15T00:00:00Z') }));
    await labeledSampleRepo.save({ messageId: 'm1', actualCategory: CONVOCATORIA });

    const dashboard = await useCase.execute(SEPTEMBER);

    expect(dashboard.precision.publishedWithLabel).toBe(0);
    expect(dashboard.coverage.actualInSample).toBe(0);
  });

  it('rechaza un periodo invertido (fin antes del inicio)', async () => {
    const { useCase } = buildUseCase();

    await expect(useCase.execute({ from: new Date('2026-09-30T00:00:00Z'), to: new Date('2026-09-01T00:00:00Z') })).rejects.toThrow(
      TypeError
    );
  });

  it('expone el periodo consultado y el instante de generacion segun el reloj inyectado', async () => {
    const { useCase } = buildUseCase();

    const dashboard = await useCase.execute(SEPTEMBER);

    expect(dashboard.period).toEqual(SEPTEMBER);
    expect(dashboard.generatedAt).toEqual(NOW);
  });
});
