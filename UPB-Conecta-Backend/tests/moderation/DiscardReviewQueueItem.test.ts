import { describe, expect, it } from 'vitest';
import {
  DiscardReasonRequiredError,
  DiscardReviewQueueItem,
  ReviewQueueItemNotFoundError
} from '../../src/contexts/moderation/application/DiscardReviewQueueItem.js';
import { InMemoryModerationAuditLog } from '../../src/contexts/moderation/infrastructure/adapters/out/memory/InMemoryModerationAuditLog.js';
import { ModerationAction } from '../../src/contexts/moderation/domain/ports/out/ModerationAuditLogPort.js';
import { InMemoryQuarantineRepository } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryQuarantineRepository.js';
import { FixedClock } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/SystemClock.js';
import { InMemoryClassificationResultRepository } from '../../src/contexts/classification/infrastructure/adapters/out/memory/InMemoryClassificationResultRepository.js';
import { MessageCategory } from '../../src/contexts/classification/domain/value-objects/MessageCategory.js';

const NOW = new Date('2026-09-23T12:00:00Z');

function buildHarness() {
  const quarantineRepo = new InMemoryQuarantineRepository();
  const classificationResultRepo = new InMemoryClassificationResultRepository();
  const moderationAuditLog = new InMemoryModerationAuditLog();
  const clock = new FixedClock(NOW);
  const useCase = new DiscardReviewQueueItem({ quarantineRepo, classificationResultRepo, moderationAuditLog, clock });
  return { useCase, quarantineRepo, classificationResultRepo, moderationAuditLog };
}

describe('DiscardReviewQueueItem (HU-49, criterio 4)', () => {
  it('descarta un elemento en cuarentena y lo audita con el motivo', async () => {
    const { useCase, quarantineRepo, moderationAuditLog } = buildHarness();
    await quarantineRepo.save({ mailboxUid: 1, cause: 'sin Message-ID', rawSource: 'raw', quarantinedAt: NOW });

    await useCase.execute({ ref: { kind: 'quarantine', mailboxUid: 1 }, subject: 'admin@upb.edu.co', reason: 'correo de prueba, no es una convocatoria' });

    expect(moderationAuditLog.decisions).toEqual([
      {
        subject: 'admin@upb.edu.co',
        action: ModerationAction.DISCARD,
        ref: { kind: 'quarantine', mailboxUid: 1 },
        reason: 'correo de prueba, no es una convocatoria',
        occurredAt: NOW
      }
    ]);
  });

  it('descarta un documento en revision pendiente', async () => {
    const { useCase, classificationResultRepo, moderationAuditLog } = buildHarness();
    await classificationResultRepo.save({
      messageId: 'm1',
      proposedCategory: MessageCategory.BOLETIN_INFORMATIVO,
      finalCategory: MessageCategory.BOLETIN_INFORMATIVO,
      isKnownFalsePositiveCase: false,
      reason: null,
      appliedRuleId: null,
      confidenceScore: 0.3,
      publicationStatus: 'pending-review',
      persistedAt: NOW
    });

    await useCase.execute({ ref: { kind: 'pending-review', messageId: 'm1' }, subject: 'admin@upb.edu.co', reason: 'boletin mal clasificado, no aplica' });

    expect(moderationAuditLog.decisions).toHaveLength(1);
  });

  it('exige un motivo no vacio', async () => {
    const { useCase, quarantineRepo } = buildHarness();
    await quarantineRepo.save({ mailboxUid: 1, cause: 'sin Message-ID', rawSource: 'raw', quarantinedAt: NOW });

    await expect(
      useCase.execute({ ref: { kind: 'quarantine', mailboxUid: 1 }, subject: 'admin@upb.edu.co', reason: '   ' })
    ).rejects.toBeInstanceOf(DiscardReasonRequiredError);
  });

  it('rechaza descartar un elemento que no existe', async () => {
    const { useCase } = buildHarness();

    await expect(
      useCase.execute({ ref: { kind: 'quarantine', mailboxUid: 999 }, subject: 'admin@upb.edu.co', reason: 'motivo' })
    ).rejects.toBeInstanceOf(ReviewQueueItemNotFoundError);
  });

  it('rechaza descartar un documento ya publicado (no esta en revision)', async () => {
    const { useCase, classificationResultRepo } = buildHarness();
    await classificationResultRepo.save({
      messageId: 'm1',
      proposedCategory: MessageCategory.EVENTO,
      finalCategory: MessageCategory.EVENTO,
      isKnownFalsePositiveCase: false,
      reason: null,
      appliedRuleId: null,
      confidenceScore: 0.9,
      publicationStatus: 'published',
      persistedAt: NOW
    });

    await expect(
      useCase.execute({ ref: { kind: 'pending-review', messageId: 'm1' }, subject: 'admin@upb.edu.co', reason: 'motivo' })
    ).rejects.toBeInstanceOf(ReviewQueueItemNotFoundError);
  });
});
