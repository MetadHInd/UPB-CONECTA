import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ScreenContent } from '../../src/contexts/moderation/application/ScreenContent.js';
import { ModerationVerdict } from '../../src/contexts/moderation/domain/services/ModerationDecisionPolicy.js';
import { InMemoryModerationAdapter } from '../../src/contexts/moderation/infrastructure/adapters/out/memory/InMemoryModerationAdapter.js';
import { InMemoryHeldContentStore } from '../../src/contexts/moderation/infrastructure/adapters/out/memory/InMemoryHeldContentStore.js';
import { InvalidModerationPolicyError, loadModerationPolicy } from '../../src/contexts/moderation/infrastructure/config/JsonModerationPolicyProvider.js';

const author = { name: 'Ana Gómez', email: 'ana@upb.edu.co' };

function writeConfig(content: unknown): string {
  const path = join(mkdtempSync(join(tmpdir(), 'moderation-policy-')), 'policy.json');
  writeFileSync(path, typeof content === 'string' ? content : JSON.stringify(content));
  return path;
}

describe('HU-31 — política de moderación como dato (config/moderation-policy.json)', () => {
  it('el archivo real carga con umbrales válidos, plazo menor a 3 s y diccionario no vacío', () => {
    const policy = loadModerationPolicy();
    expect(policy.thresholds.lower).toBeLessThan(policy.thresholds.upper);
    expect(policy.timeoutMs).toBeLessThan(3000);
    expect(policy.bannedTerms.length).toBeGreaterThan(0);
    expect(() => new ScreenContent({ moderation: new InMemoryModerationAdapter(), policy })).not.toThrow();
  });

  it('cambiar el JSON cambia la decisión sin tocar código', async () => {
    const strict = loadModerationPolicy(writeConfig({ thresholds: { lower: 0.01, upper: 0.5 }, timeoutMs: 500, bannedTerms: ['zzz'] }));
    const moderate = new ScreenContent({ moderation: new InMemoryModerationAdapter(), policy: strict });
    expect((await moderate.execute({ title: 't', text: 'texto limpio', author })).verdict).toBe(ModerationVerdict.RETAIN);
    expect((await moderate.execute({ title: 't', text: 'zzz', author })).verdict).toBe(ModerationVerdict.BLOCK);
  });

  it.each([
    ['archivo inexistente', '/no/existe.json'],
    ['JSON ilegible', writeConfig('{no es json')],
    ['sin umbrales', writeConfig({ timeoutMs: 100, bannedTerms: [] })],
    ['sin plazo', writeConfig({ thresholds: { lower: 0.1, upper: 0.9 }, bannedTerms: [] })],
    ['diccionario mal formado', writeConfig({ thresholds: { lower: 0.1, upper: 0.9 }, timeoutMs: 100, bannedTerms: [1] })]
  ])('falla al cargar con %s', (_name, path) => {
    expect(() => loadModerationPolicy(path)).toThrow(InvalidModerationPolicyError);
  });

  it('umbrales invertidos en el archivo se rechazan', () => {
    expect(() => loadModerationPolicy(writeConfig({ thresholds: { lower: 0.9, upper: 0.1 }, timeoutMs: 100, bannedTerms: [] }))).toThrow(/umbral/i);
  });
});

describe('HU-31 — stub del modelo de detección en español', () => {
  const analyze = (text: string) => new InMemoryModerationAdapter().analyze({ text }).then((r) => r.score);

  it('es determinístico y separa limpio, leve y fuerte', async () => {
    expect(await analyze('Vendo calculadora')).toBe(0.05);
    expect(await analyze('Eres un TONTO')).toBe(0.6);
    expect(await analyze('tonto e inútil')).toBe(0.9);
    expect(await analyze('qué mierda')).toBe(0.9);
    expect(await analyze('Eres un TONTO')).toBe(await analyze('Eres un TONTO'));
  });
});

describe('HU-31 — cola de revisión humana en memoria', () => {
  const item = (id: string, minutes: number) => ({
    id,
    kind: 'post' as const,
    topicId: 'general',
    title: 't',
    text: 'x',
    author: { email: 'a@upb.edu.co', name: 'A', programName: 'P', programId: null },
    reason: 'between-thresholds' as never,
    score: 0.5,
    retainedAt: new Date(Date.UTC(2026, 8, 22, 12, minutes))
  });

  it('ordena el más antiguo primero y encolar dos veces el mismo id no duplica', async () => {
    const queue = new InMemoryHeldContentStore();
    await queue.enqueue(item('b', 5));
    await queue.enqueue(item('a', 1));
    await queue.enqueue(item('a', 9));
    expect((await queue.findPending()).map((i) => i.id)).toEqual(['a', 'b']);
  });
});
