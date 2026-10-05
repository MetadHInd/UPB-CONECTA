import { describe, it, expect } from 'vitest';
import { QuarantineIncidentPolicy } from '../../src/contexts/ingestion/domain/services/QuarantineIncidentPolicy.js';
import { IngestionRunLog } from '../../src/contexts/ingestion/domain/entities/IngestionRunLog.js';

function logWith(read: number, quarantined: number): IngestionRunLog {
  const log = new IngestionRunLog(new Date('2026-09-11T10:00:00Z'));
  for (let i = 0; i < read; i += 1) log.recordRead();
  for (let i = 0; i < quarantined; i += 1) log.recordQuarantined();
  return log;
}

describe('QuarantineIncidentPolicy', () => {
  it('rechaza un umbral negativo en la construccion', () => {
    expect(() => new QuarantineIncidentPolicy(-0.1)).toThrow(RangeError);
  });

  it('no dispara el umbral cuando no se intento ningun mensaje', () => {
    const policy = new QuarantineIncidentPolicy(0.2);
    expect(policy.exceedsThreshold(logWith(0, 0))).toBe(false);
  });

  it('no dispara el umbral cuando la proporcion esta en o por debajo del limite (sobre el total intentado)', () => {
    const policy = new QuarantineIncidentPolicy(0.2);
    expect(policy.exceedsThreshold(logWith(8, 2))).toBe(false); // 2 de 10 intentados = exactamente 20%
  });

  it('dispara el umbral cuando la proporcion lo supera', () => {
    const policy = new QuarantineIncidentPolicy(0.2);
    expect(policy.exceedsThreshold(logWith(7, 3))).toBe(true); // 3 de 10 = 30%
  });

  it('un lote enteramente en cuarentena (read=0) si dispara el umbral: dividir solo por read lo habria dejado sin detectar', () => {
    const policy = new QuarantineIncidentPolicy(0.2);
    expect(policy.exceedsThreshold(logWith(0, 5))).toBe(true);
  });

  it('un umbral de 0 dispara ante cualquier cuarentena', () => {
    const policy = new QuarantineIncidentPolicy(0);
    expect(policy.exceedsThreshold(logWith(9, 1))).toBe(true);
    expect(policy.exceedsThreshold(logWith(10, 0))).toBe(false);
  });
});
