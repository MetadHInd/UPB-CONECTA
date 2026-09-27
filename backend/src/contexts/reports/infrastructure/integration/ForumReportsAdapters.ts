import type { RecordInfraction } from '../../../forum/application/RecordInfraction.js';
import { InfractionOutcome } from '../../../forum/domain/entities/Infraction.js';
import { isPostHidden } from '../../../forum/domain/entities/Post.js';
import type { PostRepositoryPort } from '../../../forum/domain/ports/out/PostRepositoryPort.js';
import type { ReportedContentKind, ReportedContentSnapshot } from '../../domain/entities/ContentReportCase.js';
import type { ClockPort } from '../../domain/ports/out/ClockPort.js';
import type { InfractionRecorderPort, InfractionRecordOutcome } from '../../domain/ports/out/InfractionRecorderPort.js';
import type { ReportableContent, ReportedContentPort } from '../../domain/ports/out/ReportedContentPort.js';

/**
 * El foro como dueno del contenido reportable. Hoy el foro solo tiene
 * publicaciones: un comentario no existe, asi que se responde "no
 * encontrado" hasta que el foro los incorpore (HU-34 lo deja diferido para
 * comentarios).
 */
export class ForumReportedContentAdapter implements ReportedContentPort {
  constructor(private readonly dependencies: { readonly posts: PostRepositoryPort; readonly clock: ClockPort }) {}

  async find(kind: ReportedContentKind, id: string): Promise<ReportableContent | null> {
    if (kind !== 'post') return null;
    const post = await this.dependencies.posts.findById(id);
    if (post === null) return null;
    return {
      kind: 'post',
      id: post.id,
      topicId: post.topicId,
      title: post.title,
      text: post.text,
      authorEmail: post.author.email,
      hidden: isPostHidden(post)
    };
  }

  async setHidden(kind: ReportedContentKind, id: string, hidden: boolean): Promise<void> {
    if (kind !== 'post') return;
    await this.dependencies.posts.setHidden(id, hidden ? this.dependencies.clock.now() : null);
  }
}

/** Confirmar una infraccion escribe en el historial de HU-35 (`RecordInfraction`), sin duplicarlo. */
export class ForumInfractionRecorderAdapter implements InfractionRecorderPort {
  constructor(private readonly recordInfraction: RecordInfraction) {}

  async recordBlocked(input: {
    readonly studentEmail: string;
    readonly content: ReportedContentSnapshot;
    readonly reason: string;
    readonly detectedBy: string;
  }): Promise<InfractionRecordOutcome> {
    const result = await this.recordInfraction.execute({
      studentEmail: input.studentEmail,
      content: input.content,
      outcome: InfractionOutcome.BLOCKED,
      reason: input.reason,
      detectedBy: input.detectedBy
    });
    return result.ok ? { ok: true, sanctionLevel: result.sanction?.level ?? null } : { ok: false, message: result.message };
  }
}
