import { describe, expect, it } from 'vitest';
import { buildFeedbackHarness, HOUR_MS, NOW, retainDecision } from './feedbackHarness.js';

async function harnessWithRetained() {
  const harness = buildFeedbackHarness();
  await harness.handle.execute(retainDecision({ internalDetail: { score: 0.71, threshold: 0.6 } }));
  harness.clock.advance(3 * HOUR_MS);
  return harness;
}

describe('ApproveRetainedContent (HU-32, criterio 4)', () => {
  it('publica el contenido retenido, cierra la revision e informa al autor', async () => {
    const { approve, publisher, queue, notices, clock } = await harnessWithRetained();

    const result = await approve.execute({ contentId: 'post-1', reviewer: 'admin@upb.edu.co' });

    expect(result.ok).toBe(true);
    expect(publisher.published).toEqual([{ contentId: 'post-1', contentKind: 'post' }]);
    expect(await queue.findByContentId('post-1')).toMatchObject({ status: 'approved', resolvedBy: 'admin@upb.edu.co', resolvedAt: clock.now() });
    expect(await queue.findPending()).toHaveLength(0);
    const last = notices.toAuthors.at(-1);
    expect(last).toMatchObject({ authorEmail: 'ana@upb.edu.co', contentId: 'post-1' });
    expect(last?.feedback.kind).toBe('approved');
    expect(last?.feedback.message).toContain('aprobada');
  });

  it('registra la aprobacion con la categoria y el fragmento de la retencion revertida, y el revisor', async () => {
    const { approve, log } = await harnessWithRetained();

    await approve.execute({ contentId: 'post-1', reviewer: 'admin@upb.edu.co' });

    const entries = await log.findByContentId('post-1');
    expect(entries).toHaveLength(2);
    expect(entries[1]).toMatchObject({
      verdict: 'publish',
      category: 'harassment',
      fragment: 'eres un inutil',
      decidedBy: 'admin@upb.edu.co',
      source: 'human-review',
      internalDetail: null
    });
  });

  it('el aviso de aprobacion tampoco expone el detalle interno', async () => {
    const { approve, notices } = await harnessWithRetained();

    await approve.execute({ contentId: 'post-1', reviewer: 'admin@upb.edu.co' });

    const exposed = JSON.stringify(notices.toAuthors.at(-1));
    expect(exposed).not.toContain('0.71');
    expect(exposed).not.toContain('threshold');
    expect(exposed).not.toContain('inutil');
  });

  it('si la publicacion falla, la revision sigue pendiente y no se avisa ni se registra nada', async () => {
    const { approve, publisher, queue, notices, log } = await harnessWithRetained();
    publisher.failWith = new Error('foro caido');

    await expect(approve.execute({ contentId: 'post-1', reviewer: 'admin@upb.edu.co' })).rejects.toThrow('foro caido');

    expect((await queue.findByContentId('post-1'))?.status).toBe('pending');
    expect(notices.toAuthors).toHaveLength(1); // solo el aviso de "en revision"
    expect(await log.findByContentId('post-1')).toHaveLength(1);
  });

  it('no aprueba dos veces', async () => {
    const { approve, publisher } = await harnessWithRetained();
    await approve.execute({ contentId: 'post-1', reviewer: 'admin@upb.edu.co' });

    const again = await approve.execute({ contentId: 'post-1', reviewer: 'otro@upb.edu.co' });

    expect(again).toMatchObject({ ok: false, error: 'already-resolved' });
    expect(publisher.published).toHaveLength(1);
  });

  it('rechaza un contenido que no esta en la cola', async () => {
    const { approve } = buildFeedbackHarness();

    expect(await approve.execute({ contentId: 'nada', reviewer: 'admin@upb.edu.co' })).toMatchObject({ ok: false, error: 'not-found' });
  });

  it('exige el revisor', async () => {
    const { approve, publisher } = await harnessWithRetained();

    expect(await approve.execute({ contentId: 'post-1', reviewer: '  ' })).toMatchObject({ ok: false, error: 'invalid-request' });
    expect(publisher.published).toHaveLength(0);
  });
});

describe('RejectRetainedContent (HU-32, criterios 2, 4 y 6)', () => {
  it('cierra la revision como rechazada e informa al autor el motivo y la norma, sin publicar', async () => {
    const { reject, publisher, queue, notices } = await harnessWithRetained();

    const result = await reject.execute({ contentId: 'post-1', reviewer: 'admin@upb.edu.co' });

    expect(result.ok).toBe(true);
    expect(publisher.published).toHaveLength(0);
    expect(await queue.findByContentId('post-1')).toMatchObject({ status: 'rejected', resolvedBy: 'admin@upb.edu.co' });
    const last = notices.toAuthors.at(-1);
    expect(last?.feedback).toMatchObject({ kind: 'rejected', norm: { code: 'NC-01' } });
    expect(JSON.stringify(last)).not.toContain('score');
    expect(JSON.stringify(last)).not.toContain('inutil');
  });

  it('registra un bloqueo humano con el fragmento original y la categoria', async () => {
    const { reject, log } = await harnessWithRetained();

    await reject.execute({ contentId: 'post-1', reviewer: 'admin@upb.edu.co' });

    const entries = await log.findByContentId('post-1');
    expect(entries[1]).toMatchObject({
      verdict: 'block',
      category: 'harassment',
      fragment: 'eres un inutil',
      decidedBy: 'admin@upb.edu.co',
      source: 'human-review'
    });
  });

  it('el revisor puede reclasificar la infraccion y el aviso cita la norma de esa categoria', async () => {
    const { reject, log, notices } = await harnessWithRetained();

    const result = await reject.execute({ contentId: 'post-1', reviewer: 'admin@upb.edu.co', category: 'spam' });

    expect(result.ok).toBe(true);
    expect((await log.findByContentId('post-1'))[1]?.category).toBe('spam');
    expect(notices.toAuthors.at(-1)?.feedback).toMatchObject({ norm: { code: 'NC-05' } });
  });

  it('rechaza una categoria sin norma configurada sin cambiar nada', async () => {
    const { reject, queue } = await harnessWithRetained();

    const result = await reject.execute({ contentId: 'post-1', reviewer: 'admin@upb.edu.co', category: 'inventada' });

    expect(result).toMatchObject({ ok: false, error: 'unknown-category' });
    expect((await queue.findByContentId('post-1'))?.status).toBe('pending');
  });

  it('no rechaza algo ya aprobado, ni algo inexistente, ni sin revisor', async () => {
    const { approve, reject } = await harnessWithRetained();
    await approve.execute({ contentId: 'post-1', reviewer: 'admin@upb.edu.co' });

    expect(await reject.execute({ contentId: 'post-1', reviewer: 'admin@upb.edu.co' })).toMatchObject({ ok: false, error: 'already-resolved' });
    expect(await reject.execute({ contentId: 'nada', reviewer: 'admin@upb.edu.co' })).toMatchObject({ ok: false, error: 'not-found' });
    expect(await reject.execute({ contentId: 'post-1', reviewer: '' })).toMatchObject({ ok: false, error: 'invalid-request' });
  });
});

describe('GetRetainedContentQueue y EscalateOverdueRetainedContent (HU-32, criterio 5)', () => {
  it('lista los pendientes por plazo mas proximo con el tiempo restante y la marca de vencido', async () => {
    const { handle, getQueue, clock } = buildFeedbackHarness();
    await handle.execute(retainDecision({ contentId: 'a' }));
    clock.advance(10 * HOUR_MS);
    await handle.execute(retainDecision({ contentId: 'b' }));
    clock.advance(15 * HOUR_MS); // a: vencida por 1 h; b: le quedan 9 h

    const items = await getQueue.execute();

    expect(items.map((i) => i.review.contentId)).toEqual(['a', 'b']);
    expect(items.map((i) => i.overdue)).toEqual([true, false]);
    expect(items.map((i) => i.remainingMs)).toEqual([-1 * HOUR_MS, 9 * HOUR_MS]);
  });

  it('no lista lo ya resuelto', async () => {
    const { handle, approve, getQueue } = buildFeedbackHarness();
    await handle.execute(retainDecision());
    await approve.execute({ contentId: 'post-1', reviewer: 'admin@upb.edu.co' });

    expect(await getQueue.execute()).toEqual([]);
  });

  it('exactamente en el limite de 24 h aun no esta vencido; un instante despues si', async () => {
    const { handle, getQueue, clock } = buildFeedbackHarness();
    await handle.execute(retainDecision());

    clock.advance(24 * HOUR_MS);
    expect((await getQueue.execute())[0]?.overdue).toBe(false);
    clock.advance(1);
    expect((await getQueue.execute())[0]?.overdue).toBe(true);
  });

  it('escala una sola vez cada revision vencida: avisa a administradores y la marca', async () => {
    const { handle, escalate, notices, queue, clock } = buildFeedbackHarness();
    await handle.execute(retainDecision({ contentId: 'a' }));
    await handle.execute(retainDecision({ contentId: 'b' }));
    clock.advance(25 * HOUR_MS);

    const first = await escalate.execute();
    const second = await escalate.execute();

    expect(first).toEqual({ escalated: 2 });
    expect(second).toEqual({ escalated: 0 });
    expect(notices.toAdministrators.map((n) => n.contentId).sort()).toEqual(['a', 'b']);
    expect((await queue.findByContentId('a'))?.escalatedAt).toEqual(clock.now());
  });

  it('no escala lo que esta a tiempo ni lo ya resuelto', async () => {
    const { handle, approve, escalate, notices, clock } = buildFeedbackHarness();
    await handle.execute(retainDecision({ contentId: 'a' }));
    await handle.execute(retainDecision({ contentId: 'b' }));
    clock.advance(23 * HOUR_MS);
    expect(await escalate.execute()).toEqual({ escalated: 0 });
    clock.advance(2 * HOUR_MS);
    await approve.execute({ contentId: 'a', reviewer: 'admin@upb.edu.co' });

    expect(await escalate.execute()).toEqual({ escalated: 1 });
    expect(notices.toAdministrators.map((n) => n.contentId)).toEqual(['b']);
  });

  it('la revision creada en NOW nace sin vencer', async () => {
    const { handle, queue } = buildFeedbackHarness();
    await handle.execute(retainDecision());

    expect((await queue.findOverdueNotEscalated(NOW))).toHaveLength(0);
  });
});
