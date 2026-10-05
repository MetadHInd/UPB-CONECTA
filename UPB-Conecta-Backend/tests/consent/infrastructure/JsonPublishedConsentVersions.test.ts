import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPublishedConsentVersions } from '../../../src/contexts/consent/infrastructure/config/JsonPublishedConsentVersions.js';
import { currentVersionOf } from '../../../src/contexts/consent/domain/ports/out/PublishedConsentVersionsPort.js';

describe('loadPublishedConsentVersions (HU-44, criterios 1 y 3)', () => {
  it('lee las versiones publicadas del catalogo real del proyecto', () => {
    const catalog = loadPublishedConsentVersions();

    expect(currentVersionOf(catalog, 'privacy-policy')).toEqual(expect.any(String));
    expect(currentVersionOf(catalog, 'forum-guidelines')).toEqual(expect.any(String));
  });

  it('lee un catalogo alternativo desde una ruta explicita, sin recompilar', () => {
    const dir = mkdtempSync(join(tmpdir(), 'consent-versions-'));
    const path = join(dir, 'custom-versions.json');
    writeFileSync(path, JSON.stringify({ 'privacy-policy': 'v9', 'forum-guidelines': 'v9' }));

    const catalog = loadPublishedConsentVersions(path);

    expect(currentVersionOf(catalog, 'privacy-policy')).toBe('v9');
  });

  it('currentVersionOf devuelve null si el catalogo no declara un documento (configuracion incompleta)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'consent-versions-'));
    const path = join(dir, 'incomplete-versions.json');
    writeFileSync(path, JSON.stringify({ 'privacy-policy': 'v1' }));

    const catalog = loadPublishedConsentVersions(path);

    expect(currentVersionOf(catalog, 'forum-guidelines')).toBeNull();
  });
});
