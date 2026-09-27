import { describe, expect, it } from 'vitest';
import { PostRejectionKind } from '../../src/contexts/forum/application/CreatePost.js';
import { InfractionOutcome } from '../../src/contexts/forum/domain/entities/Infraction.js';
import { buildForumHarness } from './forumHarness.js';

const ANA = 'ana@upb.edu.co';
const body = (overrides: Record<string, unknown> = {}) => ({ title: 'Vendo calculadora', text: 'Casio fx-991, poco uso.', ...overrides });

async function forumWithAna() {
  const forum = buildForumHarness();
  await forum.seed.execute(forum.seedTopics);
  await forum.login('ana');
  return forum;
}

const publish = (forum: Awaited<ReturnType<typeof forumWithAna>>, overrides: Record<string, unknown> = {}) =>
  forum.createPost.execute({ authorEmail: ANA, topicId: 'general', body: body(overrides) });

describe('HU-31 — moderación automática previa a la publicación (RF-50, RF-51; CU-03)', () => {
  describe('criterio 1 — el texto se analiza antes de hacerse visible', () => {
    it('el modelo recibe título y texto y la publicación solo se guarda después del análisis', async () => {
      const forum = await forumWithAna();

      await publish(forum, { title: 'Aviso', text: 'Texto del aviso' });

      expect(forum.moderationPort.requests).toEqual([{ text: 'Aviso\nTexto del aviso' }]);
    });

    it('un envío rechazado por validación no llega al servicio de moderación', async () => {
      const forum = await forumWithAna();

      await forum.createPost.execute({ authorEmail: ANA, topicId: 'general', body: { title: '', text: '' } });

      expect(forum.moderationPort.requests).toHaveLength(0);
    });
  });

  describe('criterio 2 — diccionario de términos vetados', () => {
    it('un término vetado bloquea aunque el modelo diga que está limpio', async () => {
      const forum = await forumWithAna();
      forum.moderationPort.script = { score: 0.0 };

      const result = await publish(forum, { text: 'Eres un idiota' });

      expect(result).toMatchObject({ ok: false, error: PostRejectionKind.BLOCKED_BY_MODERATION });
      expect(await forum.posts.findByTopic('general')).toHaveLength(0);
    });
  });

  describe('criterio 3 — por debajo del umbral inferior se publica con nombre y programa', () => {
    it('queda visible, firmada con el autor verificado, y no genera infracción', async () => {
      const forum = await forumWithAna();
      forum.moderationPort.script = { score: 0.39 };

      const result = await publish(forum);

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.message);
      expect(result.post.author).toEqual({ name: 'Ana Gómez', program: 'Ingeniería de Sistemas' });
      expect(await forum.posts.findByTopic('general')).toHaveLength(1);
      expect(await forum.infractions.findByStudent(ANA)).toHaveLength(0);
      expect(await forum.reviewQueue.findPending()).toHaveLength(0);
    });
  });

  describe('criterio 4 — entre umbrales se retiene, no es visible y se encola', () => {
    it('no se publica, no aparece en el listado del tema y queda en la cola de revisión humana', async () => {
      const forum = await forumWithAna();
      forum.moderationPort.script = { score: 0.6 };

      const result = await publish(forum, { title: 'Dudoso', text: 'Texto <b>dudoso</b>' });

      expect(result).toMatchObject({ ok: false, error: PostRejectionKind.RETAINED_FOR_REVIEW });
      expect(await forum.posts.findByTopic('general')).toHaveLength(0);
      const listing = await forum.listPosts.execute({ viewerEmail: ANA, topicId: 'general' });
      expect(listing).toMatchObject({ ok: true, posts: [] });

      const pending = await forum.reviewQueue.findPending();
      expect(pending).toHaveLength(1);
      expect(pending[0]).toMatchObject({
        topicId: 'general',
        title: 'Dudoso',
        author: { email: ANA, name: 'Ana Gómez', programName: 'Ingeniería de Sistemas' },
        score: 0.6,
        reason: 'between-thresholds',
        retainedAt: forum.now()
      });
      expect(pending[0]?.text).not.toContain('<b>');
    });

    it('la retención queda en el historial como "retenida" y no cuenta para sancionar', async () => {
      const forum = await forumWithAna();
      forum.moderationPort.script = { score: 0.6 };

      await publish(forum);
      await publish(forum, { title: 'Otro' });
      await publish(forum, { title: 'Otro más' });
      await publish(forum, { title: 'Y otro' });

      const history = await forum.infractions.findByStudent(ANA);
      expect(history).toHaveLength(4);
      expect(history.every((infraction) => infraction.outcome === InfractionOutcome.RETAINED)).toBe(true);
      expect(await forum.sanctions.findSanctions(ANA)).toHaveLength(0);
    });

    it('el mensaje al autor no revela el puntaje ni el motivo interno', async () => {
      const forum = await forumWithAna();
      forum.moderationPort.script = { score: 0.6 };

      const result = await publish(forum);

      if (result.ok) throw new Error('debía retenerse');
      expect(result.message).toMatch(/revisi/i);
      expect(result.message).not.toContain('0.6');
    });
  });

  describe('criterio 5 — sobre el umbral superior o término vetado: se bloquea y suma al historial', () => {
    it('bloquea por puntaje, no publica, no encola y registra una infracción bloqueada con copia del texto', async () => {
      const forum = await forumWithAna();
      forum.moderationPort.script = { score: 0.93 };

      const result = await publish(forum, { title: 'Grosería', text: 'Texto ofensivo' });

      expect(result).toMatchObject({ ok: false, error: PostRejectionKind.BLOCKED_BY_MODERATION });
      expect(await forum.posts.findByTopic('general')).toHaveLength(0);
      expect(await forum.reviewQueue.findPending()).toHaveLength(0);
      const history = await forum.infractions.findByStudent(ANA);
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        outcome: InfractionOutcome.BLOCKED,
        detectedBy: 'moderacion-automatica',
        content: { kind: 'post', topicId: 'general', title: 'Grosería', text: 'Texto ofensivo' }
      });
    });

    it('bloquea por diccionario y registra la infracción con el motivo', async () => {
      const forum = await forumWithAna();

      await publish(forum, { text: 'hijo de puta' });

      const [infraction] = await forum.infractions.findByStudent(ANA);
      expect(infraction).toMatchObject({ outcome: InfractionOutcome.BLOCKED });
      expect(infraction?.reason).toMatch(/vetad/i);
    });

    it('reutiliza el historial de HU-35: los bloqueos repetidos escalan a advertencia y suspensión', async () => {
      const forum = await forumWithAna();
      forum.moderationPort.script = { score: 0.95 };

      for (let i = 0; i < 3; i += 1) {
        forum.advanceHours(1);
        await publish(forum, { title: `Ofensa ${i}` });
      }

      const sanctions = await forum.sanctions.findSanctions(ANA);
      expect(sanctions.length).toBeGreaterThan(0);
      forum.advanceHours(1);
      forum.moderationPort.script = { score: 0.01 };
      expect(await publish(forum)).toMatchObject({ ok: false, error: PostRejectionKind.SANCTIONED });
    });

    it('la respuesta al autor no incluye el término vetado ni el puntaje', async () => {
      const forum = await forumWithAna();
      const result = await publish(forum, { text: 'idiota' });
      if (result.ok) throw new Error('debía bloquearse');
      expect(result.message).not.toContain('idiota');
    });
  });

  describe('criterio 6 — si el servicio no responde, se retiene y nunca se publica sin análisis', () => {
    it('un fallo del servicio retiene el contenido y lo encola', async () => {
      const forum = await forumWithAna();
      forum.moderationPort.script = 'fail';

      const result = await publish(forum);

      expect(result).toMatchObject({ ok: false, error: PostRejectionKind.RETAINED_FOR_REVIEW });
      expect(await forum.posts.findByTopic('general')).toHaveLength(0);
      expect(await forum.reviewQueue.findPending()).toMatchObject([{ reason: 'service-unavailable', score: null }]);
    });

    it('un servicio que no responde también retiene (vence el plazo)', async () => {
      const forum = await forumWithAna();
      forum.moderationPort.script = 'hang';

      const result = await publish(forum);

      expect(result).toMatchObject({ ok: false, error: PostRejectionKind.RETAINED_FOR_REVIEW });
      expect(await forum.posts.findByTopic('general')).toHaveLength(0);
    });

    it('una respuesta malformada del servicio retiene', async () => {
      const forum = await forumWithAna();
      forum.moderationPort.script = { raw: { score: 'NaN' } };

      expect(await publish(forum)).toMatchObject({ ok: false, error: PostRejectionKind.RETAINED_FOR_REVIEW });
    });
  });

  describe('criterio 7 — ningún envío externo lleva datos identificatorios', () => {
    it('lo enviado no contiene nombre, correo ni programa del autor, ni siquiera si los escribe en el texto', async () => {
      const forum = await forumWithAna();

      await publish(forum, { title: 'Soy Ana Gómez', text: 'Escríbanme a ana@upb.edu.co, estudio Ingeniería de Sistemas. Tel 300 123 4567' });

      const sent = JSON.stringify(forum.moderationPort.requests);
      for (const leaked of ['Ana', 'Gómez', 'ana@upb.edu.co', '300 123 4567']) expect(sent).not.toContain(leaked);
    });
  });

  describe('criterio 8 — análisis y decisión en menos de 3 segundos', () => {
    it('el flujo completo, con servicio colgado, responde antes de 3 s', async () => {
      const forum = await forumWithAna();
      forum.moderationPort.script = 'hang';
      const started = Date.now();

      await publish(forum);

      expect(Date.now() - started).toBeLessThan(3000);
    });
  });

  describe('orden de las comprobaciones', () => {
    it('un autor sancionado se rechaza antes de gastar una llamada al servicio de moderación', async () => {
      const forum = await forumWithAna();
      await forum.imposeSanction(ANA, { startsAt: new Date(forum.now().getTime() - 1000), endsAt: new Date(forum.now().getTime() + 86_400_000) });

      const result = await publish(forum);

      expect(result).toMatchObject({ ok: false, error: PostRejectionKind.SANCTIONED });
      expect(forum.moderationPort.requests).toHaveLength(0);
    });
  });
});
