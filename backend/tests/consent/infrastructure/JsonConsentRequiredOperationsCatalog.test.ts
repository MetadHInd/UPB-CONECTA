import { describe, expect, it } from 'vitest';
import { loadConsentRequiredOperationsCatalog } from '../../../src/contexts/consent/infrastructure/config/JsonConsentRequiredOperationsCatalog.js';
import { requiredConsentDocumentsFor } from '../../../src/contexts/consent/domain/ports/out/ConsentRequiredOperationsCatalogPort.js';

describe('loadConsentRequiredOperationsCatalog (HU-44, criterio 3)', () => {
  it('lee el catalogo real del proyecto y resuelve los documentos exigidos por una operacion representativa', () => {
    const catalog = loadConsentRequiredOperationsCatalog();

    expect(requiredConsentDocumentsFor(catalog, 'ViewStudentProfile')).toEqual(['privacy-policy']);
    expect(requiredConsentDocumentsFor(catalog, 'CreatePost')).toEqual(['privacy-policy', 'forum-guidelines']);
  });

  it('una operacion que no esta catalogada devuelve null, no una lista vacia (distingue "sin restriccion" de "sin declarar")', () => {
    const catalog = loadConsentRequiredOperationsCatalog();

    expect(requiredConsentDocumentsFor(catalog, 'OperacionInexistente')).toBeNull();
  });
});
