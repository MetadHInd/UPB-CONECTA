import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { InvalidRetentionPolicyError, loadRetentionPolicy } from '../../src/contexts/datarights/infrastructure/config/JsonRetentionPolicy.js';
import { RandomIdentifierGenerator } from '../../src/contexts/datarights/infrastructure/adapters/out/crypto/RandomIdentifierGenerator.js';
import { SystemClock } from '../../src/contexts/datarights/infrastructure/adapters/out/memory/SystemClock.js';

const validFile = {
  erasure: { deadlineDays: 10 },
  convocatoriaArchive: { afterDueDateDays: 30 },
  directoryCorrectionChannel: { name: 'Canal', instructions: 'Acuda al canal.' },
  retainedRecords: [{ area: 'consentimiento', description: 'Prueba de autorización', erasable: false }]
};

function policyFile(content: unknown): string {
  const path = join(mkdtempSync(join(tmpdir(), 'retention-')), 'policy.json');
  writeFileSync(path, JSON.stringify(content));
  return path;
}

describe('HU-48 — política de retención como datos en config (RNF-22/24)', () => {
  it('carga plazos, periodos y canal desde config/data-retention-policy.json', () => {
    const policy = loadRetentionPolicy();

    expect(policy.erasureDeadlineDays).toBeGreaterThan(0);
    expect(policy.convocatoriaArchiveAfterDays).toBeGreaterThan(0);
    expect(policy.directoryCorrectionChannel.name).not.toBe('');
    expect(policy.retainedRecords.length).toBeGreaterThan(0);
  });

  it('cambiar el archivo cambia la política sin tocar código', () => {
    const policy = loadRetentionPolicy(policyFile(validFile));

    expect(policy).toMatchObject({ erasureDeadlineDays: 10, convocatoriaArchiveAfterDays: 30 });
    expect(policy.retainedRecords).toEqual([{ area: 'consentimiento', description: 'Prueba de autorización', erasable: false }]);
  });

  it.each([
    ['plazo de supresión no entero', { ...validFile, erasure: { deadlineDays: 1.5 } }],
    ['plazo de supresión cero', { ...validFile, erasure: { deadlineDays: 0 } }],
    ['periodo de archivo ausente', { ...validFile, convocatoriaArchive: {} }],
    ['canal sin nombre', { ...validFile, directoryCorrectionChannel: { instructions: 'x' } }],
    ['registro conservado sin descripción', { ...validFile, retainedRecords: [{ area: 'x' }] }]
  ])('rechaza al cargar: %s', (_name, content) => {
    expect(() => loadRetentionPolicy(policyFile(content))).toThrow(InvalidRetentionPolicyError);
  });

  it('el seudonimo y el id de solicitud son aleatorios y el reloj devuelve la hora actual', () => {
    const ids = new RandomIdentifierGenerator();

    expect(ids.newPseudonym()).not.toBe(ids.newPseudonym());
    expect(ids.newPseudonym()).toMatch(/^titular-suprimido-/);
    expect(ids.newRequestId()).not.toBe(ids.newRequestId());
    expect(Math.abs(new SystemClock().now().getTime() - Date.now())).toBeLessThan(1000);
  });
});
