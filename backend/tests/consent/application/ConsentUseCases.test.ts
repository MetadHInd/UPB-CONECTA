import { describe, it, expect } from 'vitest';
import { RecordConsent } from '../../../src/contexts/consent/application/RecordConsent.js';
import { GetConsentStatus } from '../../../src/contexts/consent/application/GetConsentStatus.js';
import { ConsentPolicy } from '../../../src/contexts/consent/domain/services/ConsentPolicy.js';
import { InMemoryConsentRepository } from '../../../src/contexts/consent/infrastructure/adapters/out/memory/InMemoryConsentRepository.js';
import { FixedClock } from '../../../src/contexts/consent/infrastructure/adapters/out/memory/SystemClock.js';

function buildUseCases(clock = new FixedClock(new Date('2026-01-01T10:00:00Z'))) {
  const repository = new InMemoryConsentRepository();
  return {
    repository,
    clock,
    recordConsent: new RecordConsent({ repository, clock }),
    getStatus: new GetConsentStatus({ repository, policy: new ConsentPolicy() })
  };
}

describe('Casos de uso de consentimiento (HU-44)', () => {
  it('criterio 2: registra la aceptacion con fecha, hora y version', async () => {
    const { recordConsent } = buildUseCases();
    const record = await recordConsent.execute({ studentId: 'est-1', documentType: 'privacy-policy', version: 'v1' });
    expect(record).toEqual({
      studentId: 'est-1',
      documentType: 'privacy-policy',
      version: 'v1',
      acceptedAt: new Date('2026-01-01T10:00:00Z')
    });
  });

  it('criterio 1/3: un estudiante que nunca acepto requiere consentimiento', async () => {
    const { getStatus } = buildUseCases();
    const result = await getStatus.execute({ studentId: 'est-1', documentType: 'privacy-policy', currentVersion: 'v1' });
    expect(result.status).toEqual({ kind: 'requiere-consentimiento', reason: 'nunca-acepto' });
    expect(result.history).toHaveLength(0);
  });

  it('criterio 4: la politica de datos y las normas del foro se registran de forma independiente', async () => {
    const { recordConsent, getStatus } = buildUseCases();
    await recordConsent.execute({ studentId: 'est-1', documentType: 'privacy-policy', version: 'v1' });

    const foro = await getStatus.execute({ studentId: 'est-1', documentType: 'forum-guidelines', currentVersion: 'v1' });
    expect(foro.status.kind).toBe('requiere-consentimiento');

    const politica = await getStatus.execute({ studentId: 'est-1', documentType: 'privacy-policy', currentVersion: 'v1' });
    expect(politica.status.kind).toBe('vigente');
  });

  it('criterio 5: una nueva version requiere consentimiento de nuevo, sin perder el historico', async () => {
    const clock = new FixedClock(new Date('2026-01-01T10:00:00Z'));
    const { recordConsent, getStatus } = buildUseCases(clock);
    await recordConsent.execute({ studentId: 'est-1', documentType: 'privacy-policy', version: 'v1' });

    const estado = await getStatus.execute({ studentId: 'est-1', documentType: 'privacy-policy', currentVersion: 'v2' });
    expect(estado.status).toEqual({ kind: 'requiere-consentimiento', reason: 'version-desactualizada' });

    clock.advance(60_000);
    await recordConsent.execute({ studentId: 'est-1', documentType: 'privacy-policy', version: 'v2' });

    const actualizado = await getStatus.execute({ studentId: 'est-1', documentType: 'privacy-policy', currentVersion: 'v2' });
    expect(actualizado.status.kind).toBe('vigente');
    expect(actualizado.history.map((r) => r.version)).toEqual(['v2', 'v1']); // criterio 6, mas reciente primero
  });

  it('criterio 6: el historico permite consultar que version se acepto y cuando', async () => {
    const { recordConsent, getStatus } = buildUseCases();
    await recordConsent.execute({ studentId: 'est-1', documentType: 'forum-guidelines', version: 'v1' });

    const { history } = await getStatus.execute({ studentId: 'est-1', documentType: 'forum-guidelines', currentVersion: 'v1' });
    expect(history).toEqual([
      { studentId: 'est-1', documentType: 'forum-guidelines', version: 'v1', acceptedAt: new Date('2026-01-01T10:00:00Z') }
    ]);
  });
});
