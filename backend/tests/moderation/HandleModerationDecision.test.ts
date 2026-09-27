import { describe, expect, it } from 'vitest';
import { blockDecision, buildFeedbackHarness, HOUR_MS, NOW, retainDecision } from './feedbackHarness.js';

/** Valores que jamas deben aparecer en lo que ve el autor (criterio 3). */
const INTERNAL_DETAIL = { score: 0.8734, threshold: 0.6111, model: 'toxicity-model-v9', labelScores: { insult: 0.99 } };

describe('HandleModerationDecision (HU-32)', () => {
  describe('criterio 1: contenido retenido', () => {
    it('avisa al autor que su publicacion esta en revision con el tiempo maximo de resolucion', async () => {
      const { handle, notices } = buildFeedbackHarness();

      const result = await handle.execute(retainDecision());

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.status).toBe('retained');
      expect(result.feedback).toMatchObject({
        kind: 'in-review',
        contentId: 'post-1',
        maxResolutionHours: 24,
        resolutionDeadline: new Date(NOW.getTime() + 24 * HOUR_MS)
      });
      expect(result.feedback?.message).toContain('en revisión');
      expect(result.feedback?.message).toContain('24 horas');
      expect(notices.toAuthors).toHaveLength(1);
      expect(notices.toAuthors[0]).toMatchObject({ authorEmail: 'ana@upb.edu.co', contentId: 'post-1', createdAt: NOW });
      expect(notices.toAuthors[0]?.feedback.kind).toBe('in-review');
    });

    it('el plazo sale de la configuracion, no del codigo', async () => {
      const custom = { resolutionDeadlineHours: 1, norms: [{ category: 'spam', code: 'X', title: 't', text: 'x' }] };
      const { handle } = buildFeedbackHarness(custom);

      const result = await handle.execute(retainDecision({ category: 'spam' }));

      expect(result.ok && result.feedback).toMatchObject({ maxResolutionHours: 1 });
      expect(result.ok && result.feedback?.message).toContain('1 hora.');
    });
  });

  describe('criterio 5: todo contenido retenido entra a la cola con plazo de 24 horas', () => {
    it('crea el elemento pendiente con plazo de 24 h desde la retencion', async () => {
      const { handle, queue } = buildFeedbackHarness();

      await handle.execute(retainDecision());

      const review = await queue.findByContentId('post-1');
      expect(review).toMatchObject({
        contentId: 'post-1',
        authorEmail: 'ana@upb.edu.co',
        status: 'pending',
        retainedAt: NOW,
        resolutionDeadline: new Date(NOW.getTime() + 24 * HOUR_MS),
        resolvedAt: null,
        escalatedAt: null
      });
    });

    it('un reintento de la misma retencion no duplica la cola, el registro ni el aviso', async () => {
      const { handle, queue, log, notices, clock } = buildFeedbackHarness();
      await handle.execute(retainDecision());
      clock.advance(HOUR_MS);

      const retry = await handle.execute(retainDecision());

      expect(retry.ok && retry.status).toBe('already-retained');
      expect(await queue.findPending()).toHaveLength(1);
      expect((await queue.findByContentId('post-1'))?.retainedAt).toEqual(NOW);
      expect(await log.findByContentId('post-1')).toHaveLength(1);
      expect(notices.toAuthors).toHaveLength(1);
    });
  });

  describe('criterio 2: contenido bloqueado', () => {
    it('el autor recibe el motivo y la norma de convivencia infringida', async () => {
      const { handle, notices } = buildFeedbackHarness();

      const result = await handle.execute(blockDecision());

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.status).toBe('blocked');
      expect(result.feedback).toMatchObject({
        kind: 'blocked',
        contentId: 'post-1',
        norm: { code: 'NC-01', title: 'Respeto y no acoso', text: 'No se permite hostigar a otras personas.' }
      });
      expect(result.feedback?.kind === 'blocked' && result.feedback.reason).toContain('NC-01');
      expect(notices.toAuthors).toHaveLength(1);
      expect(notices.toAuthors[0]?.feedback.kind).toBe('blocked');
    });

    it('un bloqueo no entra a la cola de revision', async () => {
      const { handle, queue } = buildFeedbackHarness();

      await handle.execute(blockDecision());

      expect(await queue.findPending()).toHaveLength(0);
    });

    it('un reintento del mismo bloqueo no duplica registro ni aviso', async () => {
      const { handle, log, notices } = buildFeedbackHarness();
      await handle.execute(blockDecision());

      const retry = await handle.execute(blockDecision());

      expect(retry.ok && retry.status).toBe('already-blocked');
      expect(await log.findByContentId('post-1')).toHaveLength(1);
      expect(notices.toAuthors).toHaveLength(1);
    });

    it('bloquear algo que estaba retenido cierra su revision pendiente', async () => {
      const { handle, queue } = buildFeedbackHarness();
      await handle.execute(retainDecision());

      const result = await handle.execute(blockDecision({ detectedBy: 'report-review' }));

      expect(result.ok && result.status).toBe('blocked');
      expect(await queue.findPending()).toHaveLength(0);
      expect(await queue.findByContentId('post-1')).toMatchObject({ status: 'rejected', resolvedBy: 'report-review', resolvedAt: NOW });
    });
  });

  describe('criterio 3: ninguna retroalimentacion expone puntaje, umbral ni detalle del modelo', () => {
    it.each([
      ['retenido', retainDecision({ internalDetail: INTERNAL_DETAIL })],
      ['bloqueado', blockDecision({ internalDetail: INTERNAL_DETAIL })]
    ])('la vista y el aviso de un contenido %s no contienen el detalle interno', async (_name, decision) => {
      const { handle, notices } = buildFeedbackHarness();

      const result = await handle.execute(decision);

      const exposed = JSON.stringify([result.ok ? result.feedback : null, notices.toAuthors]);
      for (const secret of ['0.8734', '0.6111', 'toxicity-model-v9', 'labelScores', 'insult', 'score', 'threshold', 'model']) {
        expect(exposed).not.toContain(secret);
      }
      // ni el fragmento del autor ni quien lo detecto viajan en el aviso
      expect(exposed).not.toContain('inutil');
      expect(exposed).not.toContain('auto-moderation');
    });
  });

  describe('criterio 6: la decision registrada conserva el fragmento y la categoria', () => {
    it.each([
      ['retenida', retainDecision({ internalDetail: INTERNAL_DETAIL }), 'retain'],
      ['bloqueada', blockDecision({ internalDetail: INTERNAL_DETAIL }), 'block']
    ])('una decision %s queda en el registro con fragmento, categoria y detalle interno', async (_n, decision, verdict) => {
      const { handle, log } = buildFeedbackHarness();

      await handle.execute(decision);

      const entries = await log.findByContentId('post-1');
      expect(entries).toEqual([
        {
          contentId: 'post-1',
          contentKind: 'post',
          authorEmail: 'ana@upb.edu.co',
          verdict,
          category: 'harassment',
          fragment: 'eres un inutil',
          decidedBy: 'auto-moderation',
          source: 'automatic',
          internalDetail: INTERNAL_DETAIL,
          occurredAt: NOW
        }
      ]);
    });

    it.each([
      ['sin categoria', { category: null }],
      ['con categoria en blanco', { category: '  ' }],
      ['sin fragmento', { fragment: null }],
      ['con fragmento en blanco', { fragment: '   ' }]
    ])('rechaza una decision de bloqueo %s: no se puede sustentar', async (_n, override) => {
      const { handle, log, notices, queue } = buildFeedbackHarness();

      const result = await handle.execute(blockDecision(override));

      expect(result).toMatchObject({ ok: false, error: 'invalid-decision' });
      expect(await log.findByContentId('post-1')).toHaveLength(0);
      expect(notices.toAuthors).toHaveLength(0);
      expect(await queue.findPending()).toHaveLength(0);
    });

    it('rechaza una retencion sin fragmento', async () => {
      const { handle } = buildFeedbackHarness();

      expect(await handle.execute(retainDecision({ fragment: null }))).toMatchObject({ ok: false, error: 'invalid-decision' });
    });

    it('rechaza una categoria sin norma de convivencia configurada', async () => {
      const { handle, log } = buildFeedbackHarness();

      const result = await handle.execute(blockDecision({ category: 'inventada' }));

      expect(result).toMatchObject({ ok: false, error: 'unknown-category' });
      expect(await log.findByContentId('post-1')).toHaveLength(0);
    });

    it('rechaza contenido o autor vacios', async () => {
      const { handle } = buildFeedbackHarness();

      expect(await handle.execute(blockDecision({ contentId: ' ' }))).toMatchObject({ ok: false, error: 'invalid-decision' });
      expect(await handle.execute(blockDecision({ authorEmail: '' }))).toMatchObject({ ok: false, error: 'invalid-decision' });
    });
  });

  describe('publicar', () => {
    it('una publicacion directa no genera aviso, registro ni cola', async () => {
      const { handle, log, notices, queue } = buildFeedbackHarness();

      const result = await handle.execute({
        contentId: 'post-1',
        contentKind: 'post',
        authorEmail: 'ana@upb.edu.co',
        verdict: 'publish',
        category: null,
        fragment: null,
        detectedBy: 'auto-moderation'
      });

      expect(result).toEqual({ ok: true, status: 'no-action', feedback: null, review: null });
      expect(await log.findByContentId('post-1')).toHaveLength(0);
      expect(notices.toAuthors).toHaveLength(0);
      expect(await queue.findPending()).toHaveLength(0);
    });
  });

  it('normaliza el correo del autor', async () => {
    const { handle, notices } = buildFeedbackHarness();

    await handle.execute(blockDecision({ authorEmail: '  Ana@UPB.edu.co ' }));

    expect(notices.toAuthors[0]?.authorEmail).toBe('ana@upb.edu.co');
  });
});
