import { describe, it, expect } from 'vitest';
import { evaluateConvocatoriaStatus } from '../../src/contexts/ingestion/domain/services/ConvocatoriaStatusPolicy.js';
import type { DueDate } from '../../src/contexts/ingestion/domain/value-objects/DueDate.js';

const NOW = new Date('2026-09-13T12:00:00Z');

describe('evaluateConvocatoriaStatus', () => {
  it('criterio 4: una fecha de cierre ya pasada se marca como vencida', () => {
    const dueDate: DueDate = { kind: 'con-fecha', date: new Date('2026-09-01T00:00:00Z') };
    expect(evaluateConvocatoriaStatus(dueDate, NOW)).toBe('vencida');
  });

  it('una fecha de cierre futura se marca como vigente', () => {
    const dueDate: DueDate = { kind: 'con-fecha', date: new Date('2026-09-30T00:00:00Z') };
    expect(evaluateConvocatoriaStatus(dueDate, NOW)).toBe('vigente');
  });

  it('sin fecha de cierre declarada, el estado es explicito: sin-vencimiento', () => {
    const dueDate: DueDate = { kind: 'sin-vencimiento' };
    expect(evaluateConvocatoriaStatus(dueDate, NOW)).toBe('sin-vencimiento');
  });

  it('una fecha ambigua no se confunde con vigente ni con sin-vencimiento', () => {
    const dueDate: DueDate = { kind: 'ambigua', candidates: [new Date('2026-09-01T00:00:00Z')], reason: 'contradiccion' };
    expect(evaluateConvocatoriaStatus(dueDate, NOW)).toBe('fecha-ambigua');
  });

  it('el limite exacto (fecha de cierre igual al instante actual) no se considera vencida', () => {
    const dueDate: DueDate = { kind: 'con-fecha', date: NOW };
    expect(evaluateConvocatoriaStatus(dueDate, NOW)).toBe('vigente');
  });
});
