import { describe, it, expect } from 'vitest';
import { GetConvocatoriaDetail } from '../../src/contexts/ingestion/application/GetConvocatoriaDetail.js';
import { InMemoryConsolidatedMessageRegistry } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryConsolidatedMessageRegistry.js';
import { FixedClock } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/SystemClock.js';
import type { ConsolidatedMessageRecord } from '../../src/contexts/ingestion/domain/ports/out/ConsolidatedMessageRegistryPort.js';

const NOW = new Date('2026-09-13T12:00:00Z');

function record(overrides: Partial<ConsolidatedMessageRecord> = {}): ConsolidatedMessageRecord {
  return {
    sender: 'idiomas@upb.edu.co',
    subject: 'Convocatoria examen de suficiencia',
    body: 'Cierre: 30/09/2026. Postulate en https://upb.edu.co/postulacion/501.',
    firstSentAt: new Date('2026-09-01T10:00:00Z'),
    lastSentAt: new Date('2026-09-01T10:00:00Z'),
    resendCount: 0,
    dueDate: { kind: 'con-fecha', date: new Date('2026-09-30T05:00:00Z') },
    applicationLink: 'https://upb.edu.co/postulacion/501',
    ...overrides
  };
}

function buildUseCase(seed: ConsolidatedMessageRecord[] = [], clock = new FixedClock(NOW)) {
  const registry = new InMemoryConsolidatedMessageRegistry();
  for (const r of seed) void registry.save(r);
  return { registry, clock, useCase: new GetConvocatoriaDetail({ registry, clock }) };
}

describe('GetConvocatoriaDetail (HU-15)', () => {
  it('criterio 1: devuelve contenido completo, fecha de cierre, remitente y enlace', async () => {
    const original = record();
    const { useCase } = buildUseCase([original]);

    const detail = await useCase.execute({
      convocatoriaId: { sender: original.sender, subject: original.subject, firstSentAt: original.firstSentAt }
    });

    expect(detail).not.toBeNull();
    expect(detail?.sender).toBe(original.sender);
    expect(detail?.body).toBe(original.body);
    expect(detail?.dueDate).toEqual(original.dueDate);
    expect(detail?.applicationLink).toBe('https://upb.edu.co/postulacion/501');
  });

  it('criterio 2: sin enlace de postulacion, la ausencia es explicita (null), no un campo vacio', async () => {
    const original = record({ applicationLink: null });
    const { useCase } = buildUseCase([original]);

    const detail = await useCase.execute({
      convocatoriaId: { sender: original.sender, subject: original.subject, firstSentAt: original.firstSentAt }
    });

    expect(detail?.applicationLink).toBeNull();
    expect(detail?.applicationDomain).toBeNull();
  });

  it('criterio 3: expone el dominio de destino del enlace de postulacion', async () => {
    const original = record({ applicationLink: 'https://practicas.upb.edu.co/oferta/482' });
    const { useCase } = buildUseCase([original]);

    const detail = await useCase.execute({
      convocatoriaId: { sender: original.sender, subject: original.subject, firstSentAt: original.firstSentAt }
    });

    expect(detail?.applicationDomain).toBe('practicas.upb.edu.co');
  });

  it('criterio 4: una convocatoria con fecha de cierre pasada se marca como vencida', async () => {
    const original = record({ dueDate: { kind: 'con-fecha', date: new Date('2026-08-01T00:00:00Z') } });
    const { useCase } = buildUseCase([original]);

    const detail = await useCase.execute({
      convocatoriaId: { sender: original.sender, subject: original.subject, firstSentAt: original.firstSentAt }
    });

    expect(detail?.status).toBe('vencida');
  });

  it('una convocatoria sin fecha de cierre declarada expone el estado explicito sin-vencimiento', async () => {
    const original = record({ dueDate: { kind: 'sin-vencimiento' } });
    const { useCase } = buildUseCase([original]);

    const detail = await useCase.execute({
      convocatoriaId: { sender: original.sender, subject: original.subject, firstSentAt: original.firstSentAt }
    });

    expect(detail?.status).toBe('sin-vencimiento');
  });

  it('un enlace de postulacion malformado no revienta el detalle, solo omite el dominio', async () => {
    const original = record({ applicationLink: 'no-es-una-url' });
    const { useCase } = buildUseCase([original]);

    const detail = await useCase.execute({
      convocatoriaId: { sender: original.sender, subject: original.subject, firstSentAt: original.firstSentAt }
    });

    expect(detail?.applicationLink).toBe('no-es-una-url');
    expect(detail?.applicationDomain).toBeNull();
  });

  it('una convocatoria inexistente devuelve null', async () => {
    const { useCase } = buildUseCase([]);
    const detail = await useCase.execute({
      convocatoriaId: { sender: 'nadie@upb.edu.co', subject: 'no existe', firstSentAt: new Date('2026-01-01T00:00:00Z') }
    });
    expect(detail).toBeNull();
  });
});
