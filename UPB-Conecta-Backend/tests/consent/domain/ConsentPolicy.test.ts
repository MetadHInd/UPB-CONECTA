import { describe, it, expect } from 'vitest';
import { ConsentPolicy } from '../../../src/contexts/consent/domain/services/ConsentPolicy.js';
import type { ConsentRecord } from '../../../src/contexts/consent/domain/entities/ConsentRecord.js';

const policy = new ConsentPolicy();

function record(version: string, acceptedAt = '2026-01-01T00:00:00Z'): ConsentRecord {
  return { studentId: 'est-1', documentType: 'privacy-policy', version, acceptedAt: new Date(acceptedAt) };
}

describe('ConsentPolicy', () => {
  it('criterio 1/3: sin ningun consentimiento previo, requiere consentimiento', () => {
    const status = policy.evaluate(null, 'v1');
    expect(status).toEqual({ kind: 'requiere-consentimiento', reason: 'nunca-acepto' });
  });

  it('acepto la version vigente: el consentimiento sigue vigente', () => {
    const status = policy.evaluate(record('v1'), 'v1');
    expect(status.kind).toBe('vigente');
    if (status.kind === 'vigente') {
      expect(status.record.version).toBe('v1');
    }
  });

  it('criterio 5: una nueva version publicada invalida la aceptacion previa', () => {
    const status = policy.evaluate(record('v1'), 'v2');
    expect(status).toEqual({ kind: 'requiere-consentimiento', reason: 'version-desactualizada' });
  });
});
