import { describe, expect, it } from 'vitest';
import { ApproveRetainedContent } from '../../src/contexts/moderation/application/ApproveRetainedContent.js';
import { parseModerationFeedbackConfig } from '../../src/contexts/moderation/domain/value-objects/ModerationFeedbackConfig.js';
import { ForumHeldContentPublisher } from '../../src/contexts/forum/infrastructure/integration/ForumHeldContentPublisher.js';
import { buildForumHarness } from './forumHarness.js';

const ANA = 'ana@upb.edu.co';
const CONFIG = parseModerationFeedbackConfig({
  resolutionDeadlineHours: 24,
  norms: [{ category: 'other', code: 'NC-07', title: 'Convivencia general', text: 'El contenido incumple las normas generales.' }]
});

async function retainedPost() {
  const forum = buildForumHarness();
  await forum.seed.execute(forum.seedTopics);
  await forum.login('ana');
  forum.moderationPort.script = { score: 0.6 };
  await forum.createPost.execute({ authorEmail: ANA, topicId: 'general', body: { title: 'Consulta', text: 'Texto dudoso' } });
  const [review] = await forum.retentionQueue.findPending();
  const publisher = new ForumHeldContentPublisher({ held: forum.reviewQueue, posts: forum.posts, clock: { now: forum.now } });
  const approve = new ApproveRetainedContent({
    config: CONFIG,
    queue: forum.retentionQueue,
    log: forum.moderationLog,
    notifications: forum.authorNotices,
    publisher,
    clock: { now: forum.now }
  });
  return { forum, review: review!, publisher, approve };
}

describe('HU-32 criterio 4 sobre HU-31 — aprobar un contenido retenido lo publica en el foro', () => {
  it('antes de la aprobación el contenido no es visible', async () => {
    const { forum } = await retainedPost();

    expect(await forum.posts.findByTopic('general')).toHaveLength(0);
  });

  it('al aprobarlo queda visible con el autor original, se retira la copia y se avisa al autor', async () => {
    const { forum, review, approve } = await retainedPost();
    forum.advanceHours(2);

    const result = await approve.execute({ contentId: review.contentId, reviewer: 'admin@upb.edu.co' });

    expect(result.ok).toBe(true);
    const visible = await forum.posts.findByTopic('general');
    expect(visible).toHaveLength(1);
    expect(visible[0]).toMatchObject({ id: review.contentId, title: 'Consulta', author: { email: ANA } });
    expect(visible[0]!.publishedAt).toEqual(forum.now());
    expect(await forum.reviewQueue.findById(review.contentId)).toBeNull();
    expect(forum.authorNotices.toAuthors.some((notice) => notice.feedback.kind === 'approved')).toBe(true);
  });

  it('publicar dos veces no duplica la publicación', async () => {
    const { forum, review, publisher } = await retainedPost();

    await publisher.publish(review.contentId, 'post');
    await publisher.publish(review.contentId, 'post');

    expect(await forum.posts.findByTopic('general')).toHaveLength(1);
  });

  it('sin copia retenida ni publicación falla y la revisión sigue pendiente', async () => {
    const { forum, review, approve } = await retainedPost();
    await forum.reviewQueue.remove(review.contentId);

    await expect(approve.execute({ contentId: review.contentId, reviewer: 'admin@upb.edu.co' })).rejects.toThrow();
    expect(await forum.retentionQueue.findPending()).toHaveLength(1);
  });
});
