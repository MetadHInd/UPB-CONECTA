import { describe, expect, it } from 'vitest';
import { ScreenContent } from '../../src/contexts/moderation/application/ScreenContent.js';
import { ModerationReason, ModerationVerdict } from '../../src/contexts/moderation/domain/services/ModerationDecisionPolicy.js';
import { ModerationThresholds } from '../../src/contexts/moderation/domain/value-objects/ModerationThresholds.js';
import { ScriptedModerationPort, type ModerationScript } from './ScriptedModerationPort.js';

const author = { name: 'Ana Gómez', email: 'ana@upb.edu.co', studentId: '2024-0001' };

function build(script: ModerationScript, timeoutMs = 100) {
  const port = new ScriptedModerationPort(script);
  const moderate = new ScreenContent({
    moderation: port,
    policy: { thresholds: ModerationThresholds.of(0.4, 0.8), bannedTerms: ['idiota'], timeoutMs }
  });
  return { port, moderate };
}

describe('HU-31 — ScreenContent: análisis previo y decisión', () => {
  it('criterio 1: el texto se envía al modelo antes de decidir', async () => {
    const { port, moderate } = build({ score: 0.1 });
    const outcome = await moderate.execute({ title: 'Título', text: 'Texto limpio', author });
    expect(port.requests).toEqual([{ text: 'Título\nTexto limpio' }]);
    expect(outcome).toMatchObject({ verdict: ModerationVerdict.PUBLISH, score: 0.1 });
  });

  it('criterio 2: el diccionario bloquea aunque el modelo dé un puntaje bajo', async () => {
    const { moderate } = build({ score: 0.01 });
    expect(await moderate.execute({ title: 'x', text: 'Eres un idiota', author })).toMatchObject({
      verdict: ModerationVerdict.BLOCK,
      reason: ModerationReason.BANNED_TERM
    });
  });

  it('criterios 3, 4 y 5: publica, retiene o bloquea según el puntaje', async () => {
    expect((await build({ score: 0.2 }).moderate.execute({ title: 't', text: 'x', author })).verdict).toBe(ModerationVerdict.PUBLISH);
    expect((await build({ score: 0.6 }).moderate.execute({ title: 't', text: 'x', author })).verdict).toBe(ModerationVerdict.RETAIN);
    expect((await build({ score: 0.95 }).moderate.execute({ title: 't', text: 'x', author })).verdict).toBe(ModerationVerdict.BLOCK);
  });

  it('criterio 6: si el servicio falla, se retiene', async () => {
    expect(await build('fail').moderate.execute({ title: 't', text: 'x', author })).toMatchObject({
      verdict: ModerationVerdict.RETAIN,
      reason: ModerationReason.SERVICE_UNAVAILABLE
    });
  });

  it('criterio 6: si el servicio no responde, se retiene al vencer el plazo', async () => {
    const started = Date.now();
    const outcome = await build('hang', 50).moderate.execute({ title: 't', text: 'x', author });
    expect(outcome).toMatchObject({ verdict: ModerationVerdict.RETAIN, reason: ModerationReason.SERVICE_UNAVAILABLE });
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('criterio 6: una respuesta tardía (después del plazo) no se usa para publicar', async () => {
    const outcome = await build({ delayMs: 150, score: 0.0 }, 50).moderate.execute({ title: 't', text: 'x', author });
    expect(outcome.verdict).toBe(ModerationVerdict.RETAIN);
  });

  it.each([{ raw: null }, { raw: {} }, { raw: { score: 'alto' } }, { raw: { score: 7 } }])(
    'criterio 6: una respuesta malformada (%j) se retiene',
    async (script) => {
      const outcome = await build(script).moderate.execute({ title: 't', text: 'x', author });
      expect(outcome.verdict).toBe(ModerationVerdict.RETAIN);
    }
  );

  it('criterio 6: la coincidencia con el diccionario bloquea incluso si el servicio no responde', async () => {
    expect((await build('fail').moderate.execute({ title: 't', text: 'idiota', author })).verdict).toBe(ModerationVerdict.BLOCK);
  });

  it('criterio 7: la solicitud enviada no contiene el nombre, correo ni identificador del estudiante', async () => {
    const { port, moderate } = build({ score: 0.1 });
    await moderate.execute({ title: 'Soy Ana Gómez', text: 'Mi correo es ana@upb.edu.co y mi código 2024-0001', author });
    const sent = JSON.stringify(port.requests);
    for (const leaked of ['Ana', 'Gómez', 'ana@upb.edu.co', '2024-0001']) expect(sent).not.toContain(leaked);
  });

  it('criterio 8: análisis y decisión se completan en menos de 3 segundos aun cuando el servicio se cuelga', async () => {
    const started = Date.now();
    await build('hang', 2500).moderate.execute({ title: 't', text: 'x', author });
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it('un plazo configurado mayor a 3 segundos se rechaza para no incumplir el criterio 8', () => {
    expect(() => build({ score: 0 }, 3000)).toThrow(/plazo/i);
    expect(() => build({ score: 0 }, 0)).toThrow(/plazo/i);
  });
});
