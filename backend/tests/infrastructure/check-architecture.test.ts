import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

describe('check-architecture (HU-53) - detecta violaciones intencionales', () => {
  it('debe fallar cuando hay una import prohibida en domain/', async () => {
    const { default: os } = await import('node:os');
    const { join } = await import('node:path');
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
    const tmp = mkdtempSync(join(os.tmpdir(), 'hu53-'));
    try {
      const src = join(tmp, 'src');
      const domain = join(src, 'domain');
      mkdirSync(domain, { recursive: true });
      const badFile = join(domain, 'bad.ts');
      // violacion intencional: importar mongodb desde domain
      writeFileSync(badFile, "import { MongoClient } from 'mongodb';\nexport const x = 1;\n");

      // @ts-ignore - importing .mjs script without type declarations
      const mod = await import('../../scripts/check-architecture.mjs');
      const { checkArchitecture } = mod;
      expect(() => checkArchitecture(tmp)).toThrow();
    } finally {
      // limpiar
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
