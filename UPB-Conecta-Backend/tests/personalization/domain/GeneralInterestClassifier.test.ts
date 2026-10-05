import { describe, it, expect } from 'vitest';
import { hasNoDeadline } from '../../../src/contexts/personalization/domain/services/GeneralInterestClassifier.js';
import type { DueDate } from '../../../src/contexts/ingestion/domain/value-objects/DueDate.js';

describe('hasNoDeadline (HU-16, criterio 4 parcial)', () => {
  it('una convocatoria sin vencimiento declarado es candidata a interes general', () => {
    const dueDate: DueDate = { kind: 'sin-vencimiento' };
    expect(hasNoDeadline(dueDate)).toBe(true);
  });

  it('una convocatoria con fecha de cierre no es candidata, sin importar si ya vencio', () => {
    const dueDate: DueDate = { kind: 'con-fecha', date: new Date('2026-01-01T00:00:00Z') };
    expect(hasNoDeadline(dueDate)).toBe(false);
  });

  it('una fecha ambigua no se trata como sin plazo', () => {
    const dueDate: DueDate = { kind: 'ambigua', candidates: [new Date()], reason: 'contradiccion' };
    expect(hasNoDeadline(dueDate)).toBe(false);
  });
});
