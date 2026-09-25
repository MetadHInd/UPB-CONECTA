import { describe, expect, it } from 'vitest';
import { PublishConvocatoria } from '../../src/contexts/ingestion/application/PublishConvocatoria.js';
import { InMemoryConsolidatedMessageRegistry } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryConsolidatedMessageRegistry.js';
import { InMemoryConvocatoriaAuditLog } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryConvocatoriaAuditLog.js';
import { FixedClock } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/SystemClock.js';
import { convocatoriaIdToString } from '../../src/contexts/ingestion/domain/value-objects/ConvocatoriaId.js';
import type { ManualMessageIdGeneratorPort } from '../../src/contexts/ingestion/domain/ports/out/ManualMessageIdGeneratorPort.js';
import { ConvocatoriaAuditEventKind } from '../../src/contexts/ingestion/domain/ports/out/ConvocatoriaAuditLogPort.js';
import { InMemoryClassificationResultRepository } from '../../src/contexts/classification/infrastructure/adapters/out/memory/InMemoryClassificationResultRepository.js';
import { InMemoryNotificationSchedulingPort } from '../../src/contexts/classification/infrastructure/adapters/out/memory/InMemoryNotificationSchedulingPort.js';
import { MessageCategory } from '../../src/contexts/classification/domain/value-objects/MessageCategory.js';
import { InMemoryProgramTargetingRepository } from '../../src/contexts/targeting/infrastructure/adapters/out/memory/InMemoryProgramTargetingRepository.js';
import { programTargeting } from '../../src/contexts/targeting/domain/value-objects/ProgramTargeting.js';

const NOW = new Date('2026-09-23T12:00:00Z');

class FixedMessageIdGenerator implements ManualMessageIdGeneratorPort {
  constructor(private readonly id: string) {}
  newMessageId(): string {
    return this.id;
  }
}

function buildUseCase(messageId = 'manual-1@upb-conecta.local') {
  const consolidatedRegistry = new InMemoryConsolidatedMessageRegistry();
  const classificationResultRepo = new InMemoryClassificationResultRepository();
  const programTargetingRepo = new InMemoryProgramTargetingRepository();
  const auditLog = new InMemoryConvocatoriaAuditLog();
  const notificationSchedulingPort = new InMemoryNotificationSchedulingPort();
  const clock = new FixedClock(NOW);

  const useCase = new PublishConvocatoria({
    consolidatedRegistry,
    classificationResultRepo,
    programTargetingRepo,
    auditLog,
    messageIdGenerator: new FixedMessageIdGenerator(messageId),
    notificationSchedulingPort,
    clock
  });

  return { useCase, consolidatedRegistry, classificationResultRepo, programTargetingRepo, auditLog, notificationSchedulingPort };
}

const COMMAND = {
  sender: 'admin@upb.edu.co',
  subject: 'Convocatoria construida manualmente',
  body: 'Cierre 30/09/2026, postulate en el enlace.',
  dueDate: { kind: 'con-fecha' as const, date: new Date('2026-09-30T05:00:00Z') },
  applicationLink: 'https://upb.edu.co/postulacion/999',
  category: MessageCategory.CONVOCATORIA_CON_PLAZO,
  targeting: programTargeting(['sistemas']),
  publishedBy: 'admin@upb.edu.co'
};

describe('PublishConvocatoria (HU-50)', () => {
  it('criterio 1: crea una convocatoria con los mismos campos que produce el proceso automatico', async () => {
    const { useCase, consolidatedRegistry } = buildUseCase();

    const result = await useCase.execute(COMMAND);

    const stored = await consolidatedRegistry.findById(result.convocatoriaId);
    expect(stored?.sender).toBe(COMMAND.sender);
    expect(stored?.subject).toBe(COMMAND.subject);
    expect(stored?.body).toBe(COMMAND.body);
    expect(stored?.dueDate).toEqual(COMMAND.dueDate);
    expect(stored?.applicationLink).toBe(COMMAND.applicationLink);
    expect(stored?.withdrawnAt).toBeNull();
    expect(stored?.representativeMessageId).toBe(result.messageId);
  });

  it('criterio 2: entra al mismo flujo de segmentacion y notificacion que una convocatoria ingerida', async () => {
    const { useCase, classificationResultRepo, programTargetingRepo, notificationSchedulingPort } = buildUseCase();

    const result = await useCase.execute(COMMAND);

    const classification = await classificationResultRepo.findByMessageId(result.messageId);
    expect(classification?.finalCategory).toBe(MessageCategory.CONVOCATORIA_CON_PLAZO);
    expect(classification?.publicationStatus).toBe('published');

    const targeting = await programTargetingRepo.findByMessageId(result.messageId);
    expect(targeting?.targeting).toEqual(programTargeting(['sistemas']));

    expect(notificationSchedulingPort.scheduled).toHaveLength(1);
    expect(notificationSchedulingPort.scheduled[0]?.messageId).toBe(result.messageId);
  });

  it('criterio 6: la publicacion queda auditada con actor, objeto afectado y marca de tiempo', async () => {
    const { useCase, auditLog } = buildUseCase();

    const result = await useCase.execute(COMMAND);

    expect(auditLog.events).toEqual([
      {
        kind: ConvocatoriaAuditEventKind.PUBLISHED,
        convocatoriaId: convocatoriaIdToString(result.convocatoriaId),
        messageId: result.messageId,
        actor: COMMAND.publishedBy,
        occurredAt: NOW
      }
    ]);
  });
});
