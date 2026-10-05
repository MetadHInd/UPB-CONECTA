import { describe, expect, it } from 'vitest';
import {
  CorrectClassification,
  ConvocatoriaNotFoundError,
  DocumentNotClassifiedError
} from '../../src/contexts/classification/application/CorrectClassification.js';
import { InMemoryClassificationResultRepository } from '../../src/contexts/classification/infrastructure/adapters/out/memory/InMemoryClassificationResultRepository.js';
import { InMemoryLabeledSampleRepository } from '../../src/contexts/classification/infrastructure/adapters/out/memory/InMemoryLabeledSampleRepository.js';
import { InMemoryClassificationCorrectionRepository } from '../../src/contexts/classification/infrastructure/adapters/out/memory/InMemoryClassificationCorrectionRepository.js';
import { InMemoryNotificationSchedulingPort } from '../../src/contexts/classification/infrastructure/adapters/out/memory/InMemoryNotificationSchedulingPort.js';
import { FixedClock } from '../../src/contexts/classification/infrastructure/adapters/out/memory/SystemClock.js';
import { MessageCategory } from '../../src/contexts/classification/domain/value-objects/MessageCategory.js';
import type { ClassificationResultRecord } from '../../src/contexts/classification/domain/entities/ClassificationResult.js';
import { InMemoryConsolidatedMessageRegistry } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryConsolidatedMessageRegistry.js';
import type { ConsolidatedMessageRecord } from '../../src/contexts/ingestion/domain/ports/out/ConsolidatedMessageRegistryPort.js';
import { InMemoryProgramTargetingRepository } from '../../src/contexts/targeting/infrastructure/adapters/out/memory/InMemoryProgramTargetingRepository.js';
import { programTargeting, facultyTargeting } from '../../src/contexts/targeting/domain/value-objects/ProgramTargeting.js';
import { semesterRange } from '../../src/contexts/targeting/domain/value-objects/SemesterRange.js';

const NOW = new Date('2026-09-23T12:00:00Z');
const MESSAGE_ID = 'msg-hu11-1';

function convocatoria(overrides: Partial<ConsolidatedMessageRecord> = {}): ConsolidatedMessageRecord {
  return {
    sender: 'practicas@upb.edu.co',
    subject: 'Convocatoria practica empresarial',
    body: 'Cierre: 30/09/2026.',
    representativeMessageId: MESSAGE_ID,
    firstSentAt: new Date('2026-09-01T10:00:00Z'),
    lastSentAt: new Date('2026-09-01T10:00:00Z'),
    resendCount: 0,
    dueDate: { kind: 'con-fecha', date: new Date('2026-09-30T05:00:00Z') },
    applicationLink: null,
    withdrawnAt: null,
    ...overrides
  };
}

function classificationResult(overrides: Partial<ClassificationResultRecord> = {}): ClassificationResultRecord {
  return {
    messageId: MESSAGE_ID,
    proposedCategory: MessageCategory.BOLETIN_INFORMATIVO,
    finalCategory: MessageCategory.BOLETIN_INFORMATIVO,
    isKnownFalsePositiveCase: false,
    reason: null,
    appliedRuleId: null,
    confidenceScore: 0.4,
    publicationStatus: 'pending-review',
    persistedAt: new Date('2026-09-01T10:05:00Z'),
    ...overrides
  };
}

function convocatoriaIdOf(record: ConsolidatedMessageRecord) {
  return { sender: record.sender, subject: record.subject, firstSentAt: record.firstSentAt };
}

function buildUseCase() {
  const consolidatedRegistry = new InMemoryConsolidatedMessageRegistry();
  const classificationResultRepo = new InMemoryClassificationResultRepository();
  const labeledSampleRepo = new InMemoryLabeledSampleRepository();
  const correctionRepo = new InMemoryClassificationCorrectionRepository();
  const programTargetingRepo = new InMemoryProgramTargetingRepository();
  const notificationSchedulingPort = new InMemoryNotificationSchedulingPort();
  const clock = new FixedClock(NOW);

  const useCase = new CorrectClassification({
    consolidatedRegistry,
    classificationResultRepo,
    labeledSampleRepo,
    correctionRepo,
    programTargetingRepo,
    notificationSchedulingPort,
    clock
  });

  return {
    useCase,
    consolidatedRegistry,
    classificationResultRepo,
    labeledSampleRepo,
    correctionRepo,
    programTargetingRepo,
    notificationSchedulingPort
  };
}

describe('CorrectClassification (HU-11)', () => {
  it('criterio 1: corrige categoria, programas destinatarios y fecha de cierre de un documento en revision pendiente', async () => {
    const { useCase, consolidatedRegistry, classificationResultRepo, programTargetingRepo } = buildUseCase();
    const original = convocatoria();
    await consolidatedRegistry.save(original);
    await classificationResultRepo.save(classificationResult());

    const corrected = await useCase.execute({
      convocatoriaId: convocatoriaIdOf(original),
      correctedCategory: MessageCategory.PRACTICA,
      correctedTargeting: programTargeting(['sistemas']),
      correctedDueDate: { kind: 'con-fecha', date: new Date('2026-10-15T05:00:00Z') }
    });

    expect(corrected.finalCategory).toBe(MessageCategory.PRACTICA);
    const updatedConvocatoria = await consolidatedRegistry.findById(convocatoriaIdOf(original));
    expect(updatedConvocatoria?.dueDate).toEqual({ kind: 'con-fecha', date: new Date('2026-10-15T05:00:00Z') });
    const updatedTargeting = await programTargetingRepo.findByMessageId(MESSAGE_ID);
    expect(updatedTargeting?.targeting).toEqual(programTargeting(['sistemas']));
  });

  it('criterio 1: tambien corrige un documento que ya estaba publicado (no solo en revision pendiente)', async () => {
    const { useCase, consolidatedRegistry, classificationResultRepo } = buildUseCase();
    const original = convocatoria();
    await consolidatedRegistry.save(original);
    await classificationResultRepo.save(classificationResult({ publicationStatus: 'published', confidenceScore: 0.9 }));

    const corrected = await useCase.execute({
      convocatoriaId: convocatoriaIdOf(original),
      correctedCategory: MessageCategory.EVENTO,
      correctedTargeting: facultyTargeting('ingenieria'),
      correctedDueDate: { kind: 'sin-vencimiento' }
    });

    expect(corrected.finalCategory).toBe(MessageCategory.EVENTO);
    expect(corrected.publicationStatus).toBe('published');
  });

  it('criterio 2: la correccion queda registrada como caso etiquetado (propuesta del modelo + valor corregido)', async () => {
    const { useCase, consolidatedRegistry, classificationResultRepo, labeledSampleRepo } = buildUseCase();
    const original = convocatoria();
    await consolidatedRegistry.save(original);
    await classificationResultRepo.save(
      classificationResult({ proposedCategory: MessageCategory.BOLETIN_INFORMATIVO })
    );

    await useCase.execute({
      convocatoriaId: convocatoriaIdOf(original),
      correctedCategory: MessageCategory.BECA,
      correctedTargeting: programTargeting(['sistemas']),
      correctedDueDate: { kind: 'sin-vencimiento' }
    });

    const samples = await labeledSampleRepo.findAll();
    expect(samples).toContainEqual({ messageId: MESSAGE_ID, actualCategory: MessageCategory.BECA });

    // El registro persistido sigue conservando la propuesta original del modelo.
    const persisted = await classificationResultRepo.findByMessageId(MESSAGE_ID);
    expect(persisted?.proposedCategory).toBe(MessageCategory.BOLETIN_INFORMATIVO);
    expect(persisted?.finalCategory).toBe(MessageCategory.BECA);
  });

  it('criterio 3: un documento en revision pendiente que se corrige se publica y programa sus notificaciones', async () => {
    const { useCase, consolidatedRegistry, classificationResultRepo, notificationSchedulingPort } = buildUseCase();
    const original = convocatoria();
    await consolidatedRegistry.save(original);
    await classificationResultRepo.save(classificationResult({ publicationStatus: 'pending-review' }));

    const corrected = await useCase.execute({
      convocatoriaId: convocatoriaIdOf(original),
      correctedCategory: MessageCategory.PRACTICA,
      correctedTargeting: programTargeting(['sistemas']),
      correctedDueDate: { kind: 'con-fecha', date: new Date('2026-10-01T05:00:00Z') }
    });

    expect(corrected.publicationStatus).toBe('published');
    expect(notificationSchedulingPort.scheduled).toHaveLength(1);
    expect(notificationSchedulingPort.scheduled[0]?.messageId).toBe(MESSAGE_ID);
  });

  it('criterio 4: un documento ya publicado que se corrige recalcula segmentacion y avisos de forma consistente', async () => {
    const { useCase, consolidatedRegistry, classificationResultRepo, programTargetingRepo, notificationSchedulingPort } =
      buildUseCase();
    const original = convocatoria();
    await consolidatedRegistry.save(original);
    await classificationResultRepo.save(classificationResult({ publicationStatus: 'published', confidenceScore: 0.9 }));
    await programTargetingRepo.save({
      messageId: MESSAGE_ID,
      targeting: facultyTargeting('ingenieria'),
      semesterRange: semesterRange(3, 8),
      persistedAt: new Date('2026-09-02T00:00:00Z')
    });

    await useCase.execute({
      convocatoriaId: convocatoriaIdOf(original),
      correctedCategory: MessageCategory.PRACTICA,
      correctedTargeting: programTargeting(['industrial']),
      correctedDueDate: { kind: 'con-fecha', date: new Date('2026-11-01T05:00:00Z') }
    });

    const updatedTargeting = await programTargetingRepo.findByMessageId(MESSAGE_ID);
    expect(updatedTargeting?.targeting).toEqual(programTargeting(['industrial']));
    // El semestre ya configurado (HU-37) no se toca: esta historia no pide corregirlo.
    expect(updatedTargeting?.semesterRange).toEqual(semesterRange(3, 8));
    expect(notificationSchedulingPort.scheduled).toHaveLength(1);
  });

  it('sin resultado de clasificacion previo, la correccion se rechaza (criterio 1: solo se corrige lo ya clasificado)', async () => {
    const { useCase, consolidatedRegistry } = buildUseCase();
    const original = convocatoria();
    await consolidatedRegistry.save(original);
    // Sin classificationResultRepo.save(...): nunca paso por el clasificador.

    await expect(
      useCase.execute({
        convocatoriaId: convocatoriaIdOf(original),
        correctedCategory: MessageCategory.PRACTICA,
        correctedTargeting: programTargeting(['sistemas']),
        correctedDueDate: { kind: 'sin-vencimiento' }
      })
    ).rejects.toBeInstanceOf(DocumentNotClassifiedError);
  });

  it('sin convocatoria consolidada con ese identificador, se rechaza explicitamente', async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({
        convocatoriaId: { sender: 'no-existe@upb.edu.co', subject: 'nada', firstSentAt: new Date('2026-01-01T00:00:00Z') },
        correctedCategory: MessageCategory.PRACTICA,
        correctedTargeting: programTargeting(['sistemas']),
        correctedDueDate: { kind: 'sin-vencimiento' }
      })
    ).rejects.toBeInstanceOf(ConvocatoriaNotFoundError);
  });
});
