import { describe, expect, it } from 'vitest';
import { buildForumHarness } from './forumHarness.js';

/**
 * HU-47, criterios 4 y 7, verificados sobre el punto de entrada real que la
 * propia historia nombra ("publicación en el foro"), no solo sobre las
 * piezas de `hardening` en aislamiento.
 */
describe('CreatePost — hardening (HU-47)', () => {
  it('criterio 7: un script embebido en el texto de una publicacion queda neutralizado al persistirse', async () => {
    const forum = buildForumHarness();
    await forum.seed.execute(forum.seedTopics);
    await forum.login('ana');

    const result = await forum.createPost.execute({
      authorEmail: 'ana@upb.edu.co',
      topicId: 'general',
      body: { title: 'Alerta', text: '<script>alert(document.cookie)</script>' }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.post.text).not.toContain('<script>');
    expect(result.post.text).toContain('&lt;script&gt;');
  });

  it('criterio 4: un rechazo por contenido invalido nunca revela detalles internos', async () => {
    const forum = buildForumHarness();
    await forum.seed.execute(forum.seedTopics);
    await forum.login('ana');

    const result = await forum.createPost.execute({
      authorEmail: 'ana@upb.edu.co',
      topicId: 'general',
      body: { title: '', text: 'x' }
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).not.toMatch(/TypeError|stack|mongodb|at Object|node_modules/i);
  });
});
