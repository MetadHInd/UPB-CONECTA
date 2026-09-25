import { describe, expect, it } from 'vitest';
import {
  WithdrawConvocatoria,
  ConvocatoriaNotFoundError,
  ConvocatoriaAlreadyWithdrawnError
} from '../../src/contexts/ingestion/application/WithdrawConvocatoria.js';
import { InMemoryConsolidatedMessageRegistry } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryConsolidatedMessageRegistry.js';
import { InMemoryConvocatoriaAuditLog } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryConvocatoriaAuditLog.js';
import { FixedClock } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/SystemClock.js';
import { convocatoriaIdToString } from '../../src/contexts/ingestion/domain/value-objects/ConvocatoriaId.js';
import { ConvocatoriaAuditEventKind } from '../../src/contexts/ingestion/domain/ports/out/ConvocatoriaAuditLogPort.js';
import { InMemoryNotificationSchedulingPort } from '../../src/contexts/classification/infrastructure/adapters/out/memory/InMemoryNotificationSchedulingPort.js';
import type { ConsolidatedMessageRecord } from '../../src/contexts/ingestion/domain/ports/out/ConsolidatedMessageRegistryPort.js';

const NOW = new Date('2026-09-23T12:00:00Z');
const MESSAGE_ID = 'm-visible@upb.edu.co';

function convocatoria(overrides: Partial<ConsolidatedMessageRecord> = {}): ConsolidatedMessageRecord {
  return {
    sender: 'coordinacion@upb.edu.co',
    subject: 'Convocatoria ya visible',
    body: 'contenido erroneo detectado',
    representativeMessageId: MESSAGE_ID,
    firstSentAt: new Date('2026-09-01T10:00:00Z'),
    lastSentAt: new Date('2026-09-01T10:00:00Z'),
    resendCount: 0,
    dueDate: { kind: 'sin-vencimiento' },
    applicationLink: null,
    withdrawnAt: null,
    ...overrides
  };
}

function convocatoriaIdOf(record: ConsolidatedMessageRecord) {
  return { sender: record.sender, subject: record.subject, firstSentAt: record.firstSentAt };
}

function buildUseCase() {
  const consolidatedRegistry = new InMemoryConsolidatedMessageRegistry();
  const auditLog = new InMemoryConvocatoriaAuditLog();
  const notificationSchedulingPort = new InMemoryNotificationSchedulingPort();
  const clock = new FixedClock(NOW);
  const useCase = new WithdrawConvocatoria({ consolidatedRegistry, auditLog, notificationSchedulingPort, clock });
  return { useCase, consolidatedRegistry, auditLog, notificationSchedulingPort };
}

describe('WithdrawConvocatoria (HU-50)', () => {
  it('criterio 3: marca la convocatoria como retirada', async () => {
    const { useCase, consolidatedRegistry } = buildUseCase();
    const original = convocatoria();
    await consolidatedRegistry.save(original);

    await useCase.execute({ convocatoriaId: convocatoriaIdOf(original), withdrawnBy: 'admin@upb.edu.co' });

    const stored = await consolidatedRegistry.findById(convocatoriaIdOf(original));
    expect(stored?.withdrawnAt).toEqual(NOW);
  });

  it('criterio 4: cancela los avisos programados pendientes de la convocatoria retirada', async () => {
    const { useCase, consolidatedRegistry, notificationSchedulingPort } = buildUseCase();
    const original = convocatoria();
    await consolidatedRegistry.save(original);

    await useCase.execute({ convocatoriaId: convocatoriaIdOf(original), withdrawnBy: 'admin@upb.edu.co' });

    expect(notificationSchedulingPort.cancelled).toEqual([MESSAGE_ID]);
  });

  it('criterio 6: el retiro queda auditado con actor, objeto afectado y marca de tiempo', async () => {
    const { useCase, consolidatedRegistry, auditLog } = buildUseCase();
    const original = convocatoria();
    await consolidatedRegistry.save(original);

    await useCase.execute({ convocatoriaId: convocatoriaIdOf(original), withdrawnBy: 'admin@upb.edu.co' });

    expect(auditLog.events).toEqual([
      {
        kind: ConvocatoriaAuditEventKind.WITHDRAWN,
        convocatoriaId: convocatoriaIdToString(convocatoriaIdOf(original)),
        messageId: MESSAGE_ID,
        actor: 'admin@upb.edu.co',
        occurredAt: NOW
      }
    ]);
  });

  it('una convocatoria inexistente se rechaza explicitamente', async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({
        convocatoriaId: { sender: 'nadie@upb.edu.co', subject: 'no existe', firstSentAt: new Date('2026-01-01T00:00:00Z') },
        withdrawnBy: 'admin@upb.edu.co'
      })
    ).rejects.toBeInstanceOf(ConvocatoriaNotFoundError);
  });

  it('retirar una convocatoria ya retirada se rechaza explicitamente, no es un no-op silencioso', async () => {
    const { useCase, consolidatedRegistry } = buildUseCase();
    const original = convocatoria({ withdrawnAt: new Date('2026-09-20T00:00:00Z') });
    await consolidatedRegistry.save(original);

    await expect(
      useCase.execute({ convocatoriaId: convocatoriaIdOf(original), withdrawnBy: 'admin@upb.edu.co' })
    ).rejects.toBeInstanceOf(ConvocatoriaAlreadyWithdrawnError);
  });
});
