import { describe, expect, it } from 'vitest';
import { ConsentStatusAdapter } from '../../src/contexts/identity/infrastructure/adapters/out/consent-status/ConsentStatusAdapter.js';
import type { RequireConsentToProceedPort } from '../../src/contexts/consent/domain/ports/in/RequireConsentToProceedPort.js';
import { CONSENT_DOCUMENT_TYPES } from '../../src/contexts/consent/domain/entities/ConsentRecord.js';

describe('ConsentStatusAdapter — puente identity -> consent (HU-44, criterio 1)', () => {
  it('reporta mustConsent: false cuando el gate de consent autoriza continuar', async () => {
    const gate: RequireConsentToProceedPort = { execute: async () => ({ allowed: true }) };
    const adapter = new ConsentStatusAdapter(gate);

    const result = await adapter.getRequirement('est-1@upb.edu.co');

    expect(result).toEqual({ mustConsent: false, pending: [] });
  });

  it('traduce el bloqueo del gate a la forma que espera AuthenticationResult, con la explicacion incluida', async () => {
    const gate: RequireConsentToProceedPort = {
      execute: async () => ({
        allowed: false,
        reason: 'Debes aceptar la política de tratamiento de datos personales antes de continuar.',
        pending: [
          {
            documentType: 'privacy-policy',
            reasonCode: 'nunca-acepto',
            explanation: 'Debes aceptar la política de tratamiento de datos personales antes de continuar.'
          }
        ]
      })
    };
    const adapter = new ConsentStatusAdapter(gate);

    const result = await adapter.getRequirement('est-1@upb.edu.co');

    expect(result).toEqual({
      mustConsent: true,
      pending: [
        {
          documentType: 'privacy-policy',
          explanation: 'Debes aceptar la política de tratamiento de datos personales antes de continuar.'
        }
      ]
    });
  });

  it('consulta el gate con todos los documentos de consentimiento del primer ingreso (politica y normas del foro), no solo uno', async () => {
    let receivedDocumentTypes: readonly string[] | undefined;
    const gate: RequireConsentToProceedPort = {
      execute: async (query) => {
        receivedDocumentTypes = query.documentTypes;
        return { allowed: true };
      }
    };
    const adapter = new ConsentStatusAdapter(gate);

    await adapter.getRequirement('est-1@upb.edu.co');

    expect(receivedDocumentTypes).toEqual(CONSENT_DOCUMENT_TYPES);
  });

  it('pasa el identificador del estudiante tal cual al gate', async () => {
    let receivedStudentId: string | undefined;
    const gate: RequireConsentToProceedPort = {
      execute: async (query) => {
        receivedStudentId = query.studentId;
        return { allowed: true };
      }
    };
    const adapter = new ConsentStatusAdapter(gate);

    await adapter.getRequirement('estudiante@upb.edu.co');

    expect(receivedStudentId).toBe('estudiante@upb.edu.co');
  });
});
