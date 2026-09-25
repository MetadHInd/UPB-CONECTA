import { describe, expect, it } from 'vitest';
import {
  DocumentNotPendingReviewError,
  PublishReviewQueueItem
} from '../../src/contexts/moderation/application/PublishReviewQueueItem.js';
import { InMemoryModerationAuditLog } from '../../src/contexts/moderation/infrastructure/adapters/out/memory/InMemoryModerationAuditLog.js';
import { ModerationAction } from '../../src/contexts/moderation/domain/ports/out/ModerationAuditLogPort.js';
import { CorrectClassification } from '../../src/contexts/classification/application/CorrectClassification.js';
import { InMemoryClassificationResultRepository } from '../../src/contexts/classification/infrastructure/adapters/out/memory/InMemoryClassificationResultRepository.js';
import { InMemoryLabeledSampleRepository } from '../../src/contexts/classification/infrastructure/adapters/out/memory/InMemoryLabeledSampleRepository.js';
import { InMemoryClassificationCorrectionRepository } from '../../src/contexts/classification/infrastructure/adapters/out/memory/InMemoryClassificationCorrectionRepository.js';
import { InMemoryNotificationSchedulingPort } from '../../src/contexts/classification/infrastructure/adapters/out/memory/InMemoryNotificationSchedulingPort.js';
import { MessageCategory } from '../../src/contexts/classification/domain/value-objects/MessageCategory.js';
import { InMemoryConsolidatedMessageRegistry } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryConsolidatedMessageRegistry.js';
import { FixedClock } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/SystemClock.js';
import { InMemoryProgramTargetingRepository } from '../../src/contexts/targeting/infrastructure/adapters/out/memory/InMemoryProgramTargetingRepository.js';
import { programTargeting } from '../../src/contexts/targeting/domain/value-objects/ProgramTargeting.js';

const NOW = new Date('2026-09-23T12:00:00Z');
const MESSAGE_ID = 'm1';

function buildHarness() {
  const classificationResultRepo = new InMemoryClassificationResultRepository();
  const consolidatedRegistry = new InMemoryConsolidatedMessageRegistry();
  const programTargetingRepo = new InMemoryProgramTargetingRepository();
  const notificationSchedulingPort = new InMemoryNotificationSchedulingPort();
  const moderationAuditLog = new InMemoryModerationAuditLog();
  const clock = new FixedClock(NOW);

  const correctClassification = new CorrectClassification({
    consolidatedRegistry,
    classificationResultRepo,
    labeledSampleRepo: new InMemoryLabeledSampleRepository(),
    correctionRepo: new InMemoryClassificationCorrectionRepository(),
    programTargetingRepo,
    notificationSchedulingPort,
    clock
  });

  const useCase = new PublishReviewQueueItem({
    classificationResultRepo,
    consolidatedRegistry,
    programTargetingRepo,
    correctClassification,
    moderationAuditLog,
    clock
  });

  return { useCase, classificationResultRepo, consolidatedRegistry, programTargetingRepo, notificationSchedulingPort, moderationAuditLog };
}

describe('PublishReviewQueueItem (HU-49, criterio 3)', () => {
  it('publica un documento en revision pendiente sin cambiar su categoria, entra al feed y programa notificaciones', async () => {
    const { useCase, classificationResultRepo, consolidatedRegistry, notificationSchedulingPort } = buildHarness();
    await classificationResultRepo.save({
      messageId: MESSAGE_ID,
      proposedCategory: MessageCategory.PRACTICA,
      finalCategory: MessageCategory.PRACTICA,
      isKnownFalsePositiveCase: false,
      reason: null,
      appliedRuleId: null,
      confidenceScore: 0.55,
      publicationStatus: 'pending-review',
      persistedAt: NOW
    });
    await consolidatedRegistry.save({
      sender: 'practicas@upb.edu.co',
      subject: 'Convocatoria practica',
      body: 'cuerpo',
      representativeMessageId: MESSAGE_ID,
      firstSentAt: NOW,
      lastSentAt: NOW,
      resendCount: 0,
      dueDate: { kind: 'con-fecha', date: new Date('2026-10-01T00:00:00Z') },
      applicationLink: null,
      withdrawnAt: null
    });

    await useCase.execute({ messageId: MESSAGE_ID, subject: 'admin@upb.edu.co' });

    const updated = await classificationResultRepo.findByMessageId(MESSAGE_ID);
    expect(updated?.publicationStatus).toBe('published');
    expect(updated?.finalCategory).toBe(MessageCategory.PRACTICA);
    expect(notificationSchedulingPort.scheduled).toHaveLength(1);
  });

  it('preserva el targeting ya configurado al publicar sin cambios', async () => {
    const { useCase, classificationResultRepo, consolidatedRegistry, programTargetingRepo } = buildHarness();
    await classificationResultRepo.save({
      messageId: MESSAGE_ID,
      proposedCategory: MessageCategory.BECA,
      finalCategory: MessageCategory.BECA,
      isKnownFalsePositiveCase: false,
      reason: null,
      appliedRuleId: null,
      confidenceScore: 0.6,
      publicationStatus: 'pending-review',
      persistedAt: NOW
    });
    await consolidatedRegistry.save({
      sender: 's@upb.edu.co',
      subject: 'Beca',
      body: 'cuerpo',
      representativeMessageId: MESSAGE_ID,
      firstSentAt: NOW,
      lastSentAt: NOW,
      resendCount: 0,
      dueDate: { kind: 'sin-vencimiento' },
      applicationLink: null,
      withdrawnAt: null
    });
    await programTargetingRepo.save({ messageId: MESSAGE_ID, targeting: programTargeting(['sistemas']), persistedAt: NOW });

    await useCase.execute({ messageId: MESSAGE_ID, subject: 'admin@upb.edu.co' });

    const targeting = await programTargetingRepo.findByMessageId(MESSAGE_ID);
    expect(targeting?.targeting).toEqual(programTargeting(['sistemas']));
  });

  it('criterio 7: la publicacion queda auditada con usuario, accion y marca de tiempo', async () => {
    const { useCase, classificationResultRepo, consolidatedRegistry, moderationAuditLog } = buildHarness();
    await classificationResultRepo.save({
      messageId: MESSAGE_ID,
      proposedCategory: MessageCategory.EVENTO,
      finalCategory: MessageCategory.EVENTO,
      isKnownFalsePositiveCase: false,
      reason: null,
      appliedRuleId: null,
      confidenceScore: 0.5,
      publicationStatus: 'pending-review',
      persistedAt: NOW
    });
    await consolidatedRegistry.save({
      sender: 's@upb.edu.co',
      subject: 'Evento',
      body: 'cuerpo',
      representativeMessageId: MESSAGE_ID,
      firstSentAt: NOW,
      lastSentAt: NOW,
      resendCount: 0,
      dueDate: { kind: 'sin-vencimiento' },
      applicationLink: null,
      withdrawnAt: null
    });

    await useCase.execute({ messageId: MESSAGE_ID, subject: 'admin@upb.edu.co' });

    expect(moderationAuditLog.decisions).toEqual([
      {
        subject: 'admin@upb.edu.co',
        action: ModerationAction.PUBLISH,
        ref: { kind: 'pending-review', messageId: MESSAGE_ID },
        reason: null,
        occurredAt: NOW
      }
    ]);
  });

  it('rechaza publicar un mensaje que no esta en revision pendiente', async () => {
    const { useCase } = buildHarness();

    await expect(useCase.execute({ messageId: 'nunca-clasificado', subject: 'admin@upb.edu.co' })).rejects.toBeInstanceOf(
      DocumentNotPendingReviewError
    );
  });

  it('rechaza publicar un mensaje ya publicado', async () => {
    const { useCase, classificationResultRepo } = buildHarness();
    await classificationResultRepo.save({
      messageId: MESSAGE_ID,
      proposedCategory: MessageCategory.EVENTO,
      finalCategory: MessageCategory.EVENTO,
      isKnownFalsePositiveCase: false,
      reason: null,
      appliedRuleId: null,
      confidenceScore: 0.9,
      publicationStatus: 'published',
      persistedAt: NOW
    });

    await expect(useCase.execute({ messageId: MESSAGE_ID, subject: 'admin@upb.edu.co' })).rejects.toBeInstanceOf(
      DocumentNotPendingReviewError
    );
  });
});
