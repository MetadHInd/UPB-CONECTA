import { describe, expect, it } from 'vitest';
import { buildForumHarness } from './forumHarness.js';

const ANA = 'ana@upb.edu.co';

async function forumWithAna() {
  const forum = buildForumHarness();
  await forum.seed.execute(forum.seedTopics);
  await forum.login('ana');
  return forum;
}

const publish = (forum: Awaited<ReturnType<typeof forumWithAna>>, text: string) =>
  forum.createPost.execute({ authorEmail: ANA, topicId: 'general', body: { title: 'Aviso', text } });

describe('HU-31 + HU-32 — la decisión automática abre la revisión con plazo y avisa al autor', () => {
  it('un contenido retenido queda en la cola de revisión con plazo de 24 h y el autor recibe aviso', async () => {
    const forum = await forumWithAna();
    forum.moderationPort.script = { score: 0.6 };

    await publish(forum, 'Texto dudoso');

    const pending = await forum.retentionQueue.findPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]!.authorEmail).toBe(ANA);
    expect(pending[0]!.resolutionDeadline.getTime() - pending[0]!.retainedAt.getTime()).toBe(24 * 3_600_000);
    expect(forum.authorNotices.toAuthors).toHaveLength(1);
  });

  it('el aviso al autor y la vista de retroalimentación no exponen puntaje ni umbral', async () => {
    const forum = await forumWithAna();
    forum.moderationPort.script = { score: 0.6123 };

    await publish(forum, 'Texto dudoso');

    expect(JSON.stringify(forum.authorNotices.toAuthors)).not.toContain('0.6123');
  });

  it('un contenido bloqueado deja el registro de auditoría con el detalle interno y avisa al autor', async () => {
    const forum = await forumWithAna();
    forum.moderationPort.script = { score: 0.95 };

    await publish(forum, 'Texto ofensivo');

    expect(await forum.retentionQueue.findPending()).toHaveLength(0);
    expect(forum.authorNotices.toAuthors).toHaveLength(1);
    const logged = await forum.moderationLog.findByContentId((await forum.infractions.findByStudent(ANA))[0]!.content.id);
    expect(logged.some((entry) => entry.verdict === 'block')).toBe(true);
  });

  it('un contenido publicado no genera cola ni aviso', async () => {
    const forum = await forumWithAna();
    forum.moderationPort.script = { score: 0.05 };

    await publish(forum, 'Vendo calculadora');

    expect(await forum.retentionQueue.findPending()).toHaveLength(0);
    expect(forum.authorNotices.toAuthors).toHaveLength(0);
  });
});
