import { describe, it, expect } from 'vitest';
import {
  MissingPublishedConsentVersionError,
  RequireConsentToProceed
} from '../../../src/contexts/consent/application/RequireConsentToProceed.js';
import { GetConsentStatus } from '../../../src/contexts/consent/application/GetConsentStatus.js';
import { RecordConsent } from '../../../src/contexts/consent/application/RecordConsent.js';
import { ConsentPolicy } from '../../../src/contexts/consent/domain/services/ConsentPolicy.js';
import { InMemoryConsentRepository } from '../../../src/contexts/consent/infrastructure/adapters/out/memory/InMemoryConsentRepository.js';
import { FixedClock } from '../../../src/contexts/consent/infrastructure/adapters/out/memory/SystemClock.js';
import type { PublishedConsentVersions } from '../../../src/contexts/consent/domain/ports/out/PublishedConsentVersionsPort.js';

const VERSIONS: PublishedConsentVersions = {
  versions: { 'privacy-policy': 'v1', 'forum-guidelines': 'v2' }
};

function buildGate(versions: PublishedConsentVersions = VERSIONS) {
  const repository = new InMemoryConsentRepository();
  const clock = new FixedClock(new Date('2026-01-01T10:00:00Z'));
  const recordConsent = new RecordConsent({ repository, clock });
  const getConsentStatus = new GetConsentStatus({ repository, policy: new ConsentPolicy() });
  const gate = new RequireConsentToProceed({ getConsentStatus, versions });
  return { gate, recordConsent, repository, clock };
}

describe('RequireConsentToProceed (HU-44, criterio 3)', () => {
  it('criterio 3: bloquea y explica la razon cuando el estudiante nunca acepto el documento exigido', async () => {
    const { gate } = buildGate();

    const decision = await gate.execute({ studentId: 'est-1', documentTypes: ['privacy-policy'] });

    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error('Se esperaba bloqueo');
    expect(decision.reason).toBe('Debes aceptar la política de tratamiento de datos personales antes de continuar.');
    expect(decision.pending).toEqual([
      {
        documentType: 'privacy-policy',
        reasonCode: 'nunca-acepto',
        explanation: 'Debes aceptar la política de tratamiento de datos personales antes de continuar.'
      }
    ]);
  });

  it('permite continuar cuando el estudiante ya acepto la version vigente de todos los documentos exigidos', async () => {
    const { gate, recordConsent } = buildGate();
    await recordConsent.execute({ studentId: 'est-1', documentType: 'privacy-policy', version: 'v1' });
    await recordConsent.execute({ studentId: 'est-1', documentType: 'forum-guidelines', version: 'v2' });

    const decision = await gate.execute({
      studentId: 'est-1',
      documentTypes: ['privacy-policy', 'forum-guidelines']
    });

    expect(decision).toEqual({ allowed: true });
  });

  it('criterio 5: bloquea si acepto una version anterior a la publicada actualmente', async () => {
    const { gate, recordConsent } = buildGate();
    await recordConsent.execute({ studentId: 'est-1', documentType: 'forum-guidelines', version: 'v1' }); // publicado: v2

    const decision = await gate.execute({ studentId: 'est-1', documentTypes: ['forum-guidelines'] });

    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error('Se esperaba bloqueo por version desactualizada');
    expect(decision.pending).toEqual([
      {
        documentType: 'forum-guidelines',
        reasonCode: 'version-desactualizada',
        explanation:
          'Se publicó una nueva versión de las normas de convivencia del foro; debes aceptarla de nuevo para continuar.'
      }
    ]);
  });

  it('combina la razon de varios documentos pendientes en un solo mensaje', async () => {
    const { gate, recordConsent } = buildGate();
    await recordConsent.execute({ studentId: 'est-1', documentType: 'forum-guidelines', version: 'v1' }); // desactualizado

    const decision = await gate.execute({
      studentId: 'est-1',
      documentTypes: ['privacy-policy', 'forum-guidelines']
    });

    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error('Se esperaba bloqueo');
    expect(decision.pending).toHaveLength(2);
    expect(decision.pending.map((p) => p.documentType)).toEqual(['privacy-policy', 'forum-guidelines']);
    expect(decision.reason).toContain('política de tratamiento de datos personales');
    expect(decision.reason).toContain('normas de convivencia del foro');
  });

  it('una operacion que no exige ningun documento (lista vacia) siempre permite continuar', async () => {
    const { gate } = buildGate();

    const decision = await gate.execute({ studentId: 'est-1', documentTypes: [] });

    expect(decision).toEqual({ allowed: true });
  });

  it('un estudiante distinto es independiente: el consentimiento de uno no habilita a otro', async () => {
    const { gate, recordConsent } = buildGate();
    await recordConsent.execute({ studentId: 'est-1', documentType: 'privacy-policy', version: 'v1' });

    const decision = await gate.execute({ studentId: 'est-2', documentTypes: ['privacy-policy'] });

    expect(decision.allowed).toBe(false);
  });

  it('falla explicito si el catalogo de versiones publicadas no declara el documento exigido (configuracion incompleta)', async () => {
    const { gate } = buildGate({ versions: { 'privacy-policy': 'v1' } as PublishedConsentVersions['versions'] });

    await expect(gate.execute({ studentId: 'est-1', documentTypes: ['forum-guidelines'] })).rejects.toThrow(
      MissingPublishedConsentVersionError
    );
  });
});
