import { describe, expect, it } from 'vitest';
import { explainConsentRequirement } from '../../../src/contexts/consent/domain/services/explainConsentRequirement.js';

describe('explainConsentRequirement (HU-44, criterio 3: "explica la razon")', () => {
  it('explica que nunca acepto la politica de tratamiento de datos', () => {
    expect(explainConsentRequirement('privacy-policy', 'nunca-acepto')).toBe(
      'Debes aceptar la política de tratamiento de datos personales antes de continuar.'
    );
  });

  it('explica que nunca acepto las normas del foro', () => {
    expect(explainConsentRequirement('forum-guidelines', 'nunca-acepto')).toBe(
      'Debes aceptar las normas de convivencia del foro antes de continuar.'
    );
  });

  it('explica que se publico una nueva version de la politica de tratamiento de datos (criterio 5)', () => {
    expect(explainConsentRequirement('privacy-policy', 'version-desactualizada')).toBe(
      'Se publicó una nueva versión de la política de tratamiento de datos personales; debes aceptarla de nuevo para continuar.'
    );
  });

  it('explica que se publico una nueva version de las normas del foro (criterio 5)', () => {
    expect(explainConsentRequirement('forum-guidelines', 'version-desactualizada')).toBe(
      'Se publicó una nueva versión de las normas de convivencia del foro; debes aceptarla de nuevo para continuar.'
    );
  });

  it('cada documento y cada razon produce un texto distinto (no hay un unico mensaje generico)', () => {
    const messages = new Set([
      explainConsentRequirement('privacy-policy', 'nunca-acepto'),
      explainConsentRequirement('forum-guidelines', 'nunca-acepto'),
      explainConsentRequirement('privacy-policy', 'version-desactualizada'),
      explainConsentRequirement('forum-guidelines', 'version-desactualizada')
    ]);
    expect(messages.size).toBe(4);
  });
});
