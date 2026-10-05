import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

function buildFixtureRoot(options: { catalog: object; useCaseFile: { path: string; content: string } }) {
  const root = mkdtempSync(join(tmpdir(), 'hu46-'));
  const configDir = join(root, 'config');
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, 'protected-operations.json'), JSON.stringify(options.catalog));

  const useCasePath = join(root, options.useCaseFile.path);
  mkdirSync(join(useCasePath, '..'), { recursive: true });
  writeFileSync(useCasePath, options.useCaseFile.content);

  return root;
}

describe('check-declared-authorization (HU-46, criterio 5) - detecta operaciones administrativas sin rol declarado', () => {
  it('falla cuando un caso de uso con nombre administrativo no esta en el catalogo', async () => {
    const root = buildFixtureRoot({
      catalog: { operations: [] },
      useCaseFile: {
        path: join('src', 'contexts', 'forum', 'application', 'ManageTopics.ts'),
        content: 'export class ManageTopics {}\n'
      }
    });

    try {
      // @ts-ignore - importing .mjs script without type declarations
      const { checkDeclaredAuthorization } = await import('../../scripts/check-declared-authorization.mjs');
      expect(() => checkDeclaredAuthorization(root)).toThrow(/ManageTopics/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('no falla cuando el caso de uso administrativo si esta declarado en el catalogo', async () => {
    const root = buildFixtureRoot({
      catalog: { operations: [{ operation: 'ManageTopics', requiredRole: 'content-admin' }] },
      useCaseFile: {
        path: join('src', 'contexts', 'forum', 'application', 'ManageTopics.ts'),
        content: 'export class ManageTopics {}\n'
      }
    });

    try {
      // @ts-ignore - importing .mjs script without type declarations
      const { checkDeclaredAuthorization } = await import('../../scripts/check-declared-authorization.mjs');
      expect(checkDeclaredAuthorization(root)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('no falla para un caso de uso sin verbo administrativo en el nombre, aunque no este en el catalogo', async () => {
    const root = buildFixtureRoot({
      catalog: { operations: [] },
      useCaseFile: {
        path: join('src', 'contexts', 'feed', 'application', 'GetStudentFeed.ts'),
        content: 'export class GetStudentFeed {}\n'
      }
    });

    try {
      // @ts-ignore - importing .mjs script without type declarations
      const { checkDeclaredAuthorization } = await import('../../scripts/check-declared-authorization.mjs');
      expect(checkDeclaredAuthorization(root)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('ignora clases de error aunque coincidan con un verbo administrativo', async () => {
    const root = buildFixtureRoot({
      catalog: { operations: [] },
      useCaseFile: {
        path: join('src', 'contexts', 'classification', 'application', 'CorrectClassification.ts'),
        content: 'export class DocumentNotClassifiedError extends Error {}\n'
      }
    });

    try {
      // @ts-ignore - importing .mjs script without type declarations
      const { checkDeclaredAuthorization } = await import('../../scripts/check-declared-authorization.mjs');
      expect(checkDeclaredAuthorization(root)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
