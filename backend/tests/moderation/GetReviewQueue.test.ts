import { describe, expect, it } from 'vitest';
import { GetReviewQueue } from '../../src/contexts/moderation/application/GetReviewQueue.js';
import { InMemoryModerationAuditLog } from '../../src/contexts/moderation/infrastructure/adapters/out/memory/InMemoryModerationAuditLog.js';
import { ModerationAction } from '../../src/contexts/moderation/domain/ports/out/ModerationAuditLogPort.js';
import { InMemoryQuarantineRepository } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryQuarantineRepository.js';
import { InMemoryConsolidatedMessageRegistry } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryConsolidatedMessageRegistry.js';
import { FixedClock } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/SystemClock.js';
import { InMemoryClassificationResultRepository } from '../../src/contexts/classification/infrastructure/adapters/out/memory/InMemoryClassificationResultRepository.js';
import { MessageCategory } from '../../src/contexts/classification/domain/value-objects/MessageCategory.js';
import type { ClassificationResultRecord } from '../../src/contexts/classification/domain/entities/ClassificationResult.js';
import type { QuarantinedMessage } from '../../src/contexts/ingestion/domain/entities/QuarantinedMessage.js';
import type { ConsolidatedMessageRecord } from '../../src/contexts/ingestion/domain/ports/out/ConsolidatedMessageRegistryPort.js';

const NOW = new Date('2026-09-23T12:00:00Z');

function quarantined(overrides: Partial<QuarantinedMessage> = {}): QuarantinedMessage {
  return { mailboxUid: 1, cause: 'sin Message-ID', rawSource: 'From: x\n\ncuerpo crudo', quarantinedAt: NOW, ...overrides };
}

function pendingResult(overrides: Partial<ClassificationResultRecord> = {}): ClassificationResultRecord {
  return {
    messageId: 'm1',
    proposedCategory: MessageCategory.BOLETIN_INFORMATIVO,
    finalCategory: MessageCategory.BOLETIN_INFORMATIVO,
    isKnownFalsePositiveCase: false,
    reason: 'Confianza (0.3) por debajo del umbral (0.6).',
    appliedRuleId: null,
    confidenceScore: 0.3,
    publicationStatus: 'pending-review',
    persistedAt: NOW,
    ...overrides
  };
}

function consolidated(overrides: Partial<ConsolidatedMessageRecord> = {}): ConsolidatedMessageRecord {
  return {
    sender: 'practicas@upb.edu.co',
    subject: 'Convocatoria practica',
    body: 'cuerpo normalizado',
    representativeMessageId: 'm1',
    firstSentAt: NOW,
    lastSentAt: NOW,
    resendCount: 0,
    dueDate: { kind: 'con-fecha', date: new Date('2026-10-01T00:00:00Z') },
    applicationLink: null,
    ...overrides
  };
}

function buildUseCase(criticalAgeMs = Number.POSITIVE_INFINITY) {
  const quarantineRepo = new InMemoryQuarantineRepository();
  const classificationResultRepo = new InMemoryClassificationResultRepository();
  const consolidatedRegistry = new InMemoryConsolidatedMessageRegistry();
  const moderationAuditLog = new InMemoryModerationAuditLog();
  const clock = new FixedClock(NOW);
  const useCase = new GetReviewQueue({
    quarantineRepo,
    classificationResultRepo,
    consolidatedRegistry,
    moderationAuditLog,
    clock,
    criticalAgeMs
  });
  return { useCase, quarantineRepo, classificationResultRepo, consolidatedRegistry, moderationAuditLog };
}

describe('GetReviewQueue (HU-49)', () => {
  it('criterio 1: junta cuarentena y revision pendiente en una sola cola, cada una con su causa', async () => {
    const { useCase, quarantineRepo, classificationResultRepo, consolidatedRegistry } = buildUseCase();
    await quarantineRepo.save(quarantined());
    await classificationResultRepo.save(pendingResult());
    await consolidatedRegistry.save(consolidated());

    const queue = await useCase.execute();

    expect(queue).toHaveLength(2);
    const kinds = queue.map((entry) => entry.item.ref.kind).sort();
    expect(kinds).toEqual(['pending-review', 'quarantine']);
    expect(queue.every((entry) => entry.item.cause.length > 0)).toBe(true);
  });

  it('criterio 2: un elemento en cuarentena expone crudo pero no contenido normalizado ni clasificacion', async () => {
    const { useCase, quarantineRepo } = buildUseCase();
    await quarantineRepo.save(quarantined());

    const [entry] = await useCase.execute();

    expect(entry?.item.rawSource).toBe('From: x\n\ncuerpo crudo');
    expect(entry?.item.normalizedContent).toBeNull();
    expect(entry?.item.proposedCategory).toBeNull();
    expect(entry?.item.confidenceScore).toBeNull();
  });

  it('criterio 2: un elemento en revision pendiente expone contenido normalizado, categoria propuesta y puntaje', async () => {
    const { useCase, classificationResultRepo, consolidatedRegistry } = buildUseCase();
    await classificationResultRepo.save(pendingResult({ proposedCategory: MessageCategory.PRACTICA, confidenceScore: 0.45 }));
    await consolidatedRegistry.save(consolidated());

    const [entry] = await useCase.execute();

    expect(entry?.item.normalizedContent).toBe('cuerpo normalizado');
    expect(entry?.item.rawSource).toBeNull();
    expect(entry?.item.proposedCategory).toBe(MessageCategory.PRACTICA);
    expect(entry?.item.confidenceScore).toBe(0.45);
  });

  it('un documento publicado (no en revision) no aparece en la cola', async () => {
    const { useCase, classificationResultRepo, consolidatedRegistry } = buildUseCase();
    await classificationResultRepo.save(pendingResult({ publicationStatus: 'published' }));
    await consolidatedRegistry.save(consolidated());

    expect(await useCase.execute()).toHaveLength(0);
  });

  it('un elemento con una decision ya registrada deja de aparecer en la cola', async () => {
    const { useCase, quarantineRepo, moderationAuditLog } = buildUseCase();
    await quarantineRepo.save(quarantined({ mailboxUid: 7 }));
    await moderationAuditLog.record({
      subject: 'admin@upb.edu.co',
      action: ModerationAction.DISCARD,
      ref: { kind: 'quarantine', mailboxUid: 7 },
      reason: 'spam',
      occurredAt: NOW
    });

    expect(await useCase.execute()).toHaveLength(0);
  });

  it('criterio 6: marca como critico un elemento que lleva al menos el plazo configurado sin resolverse', async () => {
    const { useCase, quarantineRepo } = buildUseCase(1000);
    await quarantineRepo.save(quarantined({ quarantinedAt: new Date(NOW.getTime() - 5000) }));

    const [entry] = await useCase.execute();

    expect(entry?.isCritical).toBe(true);
  });
});
