import type { HeldContentPublisherPort } from '../../../moderation/domain/ports/out/HeldContentPublisherPort.js';
import type { HeldContentStorePort } from '../../../moderation/domain/ports/out/HeldContentStorePort.js';
import type { ModeratedContentKind } from '../../../moderation/domain/value-objects/ModerationDecisionInput.js';
import type { PostRepositoryPort } from '../../domain/ports/out/PostRepositoryPort.js';
import type { ClockPort } from '../../domain/ports/out/ClockPort.js';

/**
 * HU-32 criterio 4 sobre HU-31: cuando un revisor aprueba un contenido retenido, lo publica en el foro
 * desde la copia guardada en el almacén de retenidos (el envío nunca llegó a `forum_posts`).
 *
 * Idempotente: si la publicación ya existe solo retira la copia. Si no hay copia ni publicación lanza, para que
 * `ApproveRetainedContent` deje la revisión pendiente en vez de avisar al autor de algo que no ocurrió.
 * El texto ya se guardó neutralizado (HU-47 criterio 7).
 */
export class ForumHeldContentPublisher implements HeldContentPublisherPort {
  constructor(
    private readonly dependencies: { readonly held: HeldContentStorePort; readonly posts: PostRepositoryPort; readonly clock: ClockPort }
  ) {}

  async publish(contentId: string, contentKind: ModeratedContentKind): Promise<void> {
    if (contentKind !== 'post') throw new Error(`El foro aún no publica contenido de tipo "${contentKind}".`);
    const { held, posts, clock } = this.dependencies;

    if ((await posts.findById(contentId)) !== null) {
      await held.remove(contentId);
      return;
    }
    const content = await held.findById(contentId);
    if (content === null) throw new Error(`No hay copia retenida ni publicación para el contenido ${contentId}.`);

    await posts.save({
      id: content.id,
      topicId: content.topicId,
      author: content.author,
      title: content.title,
      text: content.text,
      publishedAt: clock.now()
    });
    await held.remove(contentId);
  }
}
