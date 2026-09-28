import type { FacultyProgramResolver } from '../../targeting/domain/services/FacultyProgramResolver.js';
import { neutralizeHtml } from '../../hardening/domain/services/HtmlEncoding.js';
import { normalizeForumEmail } from '../domain/entities/ForumAuthor.js';
import {
  ANONYMITY_NOT_ALLOWED_MESSAGE,
  classifyPostBody,
  toPostView,
  validatePostContent,
  type PostView
} from '../domain/entities/Post.js';
import { InfractionOutcome } from '../domain/entities/Infraction.js';
import { ModerationReason, ModerationVerdict, type ModerationDecision } from '../../moderation/domain/services/ModerationDecisionPolicy.js';
import type { ScreenContent } from '../../moderation/application/ScreenContent.js';
import type { HandleModerationDecision } from '../../moderation/application/HandleModerationDecision.js';
import type { HeldContentStorePort } from '../../moderation/domain/ports/out/HeldContentStorePort.js';
import type { RecordInfraction } from './RecordInfraction.js';
import { ForumAccessPolicy } from '../domain/services/ForumAccessPolicy.js';
import { formatSanctionEnd } from '../domain/services/SanctionMessages.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { ForumAccessAuditPort } from '../domain/ports/out/ForumAccessAuditPort.js';
import type { ForumAuthorRepositoryPort } from '../domain/ports/out/ForumAuthorRepositoryPort.js';
import type { ForumIdGeneratorPort } from '../domain/ports/out/ForumIdGeneratorPort.js';
import type { PostRepositoryPort } from '../domain/ports/out/PostRepositoryPort.js';
import type { SanctionStatusPort } from '../domain/ports/out/SanctionStatusPort.js';
import type { TopicRepositoryPort } from '../domain/ports/out/TopicRepositoryPort.js';

export enum PostRejectionKind {
  IDENTITY_FIELDS_NOT_ALLOWED = 'identity-fields-not-allowed',
  UNKNOWN_FIELD = 'unknown-field',
  INVALID_CONTENT = 'invalid-content',
  AUTHOR_NOT_VERIFIED = 'author-not-verified',
  TOPIC_NOT_FOUND = 'topic-not-found',
  TOPIC_RESTRICTED = 'topic-restricted',
  SANCTIONED = 'sanctioned',
  /** HU-31: la moderación automática dejó el texto en revisión humana; no es visible todavía. */
  RETAINED_FOR_REVIEW = 'retained-for-review',
  /** HU-31: la moderación automática lo bloqueó; sumó al historial de infracciones. */
  BLOCKED_BY_MODERATION = 'blocked-by-moderation'
}

export const RETAINED_FOR_REVIEW_MESSAGE =
  'Tu publicación quedó en revisión. Un moderador la revisará y, si cumple las normas de convivencia, se hará visible.';
export const BLOCKED_BY_MODERATION_MESSAGE =
  'Tu publicación no cumple las normas de convivencia del foro, por lo que no se publicó.';

/** Quién registra las infracciones que genera la moderación automática (HU-31). */
export const AUTOMATIC_MODERATION_DETECTOR = 'moderacion-automatica';

export interface CreatePostInput {
  /** Sujeto de la sesion verificada (HU-45); nunca un valor que el cliente elija. */
  readonly authorEmail: string;
  readonly topicId: string;
  /** Cuerpo sin tipo de la peticion: el servidor decide que campos admite. */
  readonly body: Readonly<Record<string, unknown>>;
}

export type CreatePostResult =
  | { readonly ok: true; readonly post: PostView }
  | {
      readonly ok: false;
      readonly error: PostRejectionKind;
      readonly message: string;
      readonly fields?: readonly string[];
      readonly sanctionEndsAt?: Date;
    };

/**
 * Publicar en el foro (HU-30; CU-03 pasos 1 y 2, excepcion E2). La autoria
 * sale del autor verificado sincronizado con el directorio, nunca del cuerpo
 * de la peticion. Toda la autorizacion ocurre aqui, en el servidor.
 */
export class CreatePost {
  private readonly policy: ForumAccessPolicy;

  constructor(
    private readonly dependencies: {
      readonly topics: TopicRepositoryPort;
      readonly posts: PostRepositoryPort;
      readonly authors: ForumAuthorRepositoryPort;
      readonly sanctions: SanctionStatusPort;
      readonly audit: ForumAccessAuditPort;
      readonly clock: ClockPort;
      readonly ids: ForumIdGeneratorPort;
      readonly faculties: FacultyProgramResolver;
      /** HU-31: nada se hace visible sin pasar por aquí. */
      readonly moderate: ScreenContent;
      readonly reviewQueue: HeldContentStorePort;
      readonly recordInfraction: RecordInfraction;
      /** HU-32: registra la decisión, abre la revisión con plazo y avisa al autor sin exponer el detalle del modelo. */
      readonly decisions: HandleModerationDecision;
    }
  ) {
    this.policy = new ForumAccessPolicy(dependencies.faculties);
  }

  async execute(input: CreatePostInput): Promise<CreatePostResult> {
    const { topics, posts, authors, sanctions, audit, clock, ids } = this.dependencies;

    const classification = classifyPostBody(input.body);
    if (classification.identityFields.length > 0) {
      return reject(PostRejectionKind.IDENTITY_FIELDS_NOT_ALLOWED, ANONYMITY_NOT_ALLOWED_MESSAGE, {
        fields: classification.identityFields
      });
    }
    if (classification.unknownFields.length > 0) {
      return reject(PostRejectionKind.UNKNOWN_FIELD, 'La publicación no admite esos campos.', {
        fields: classification.unknownFields
      });
    }
    const content = validatePostContent(input.body['title'], input.body['text']);
    if (!content.valid) return reject(PostRejectionKind.INVALID_CONTENT, content.message);

    const email = normalizeForumEmail(input.authorEmail);
    const now = clock.now();
    const [author, topic, studentSanctions] = await Promise.all([
      authors.findByEmail(email),
      topics.findById(input.topicId),
      sanctions.findSanctions(email)
    ]);

    const decision = this.policy.decidePublication({ author, topic, sanctions: studentSanctions, now });
    if (!decision.allowed) {
      switch (decision.reason) {
        case 'author-not-verified':
          return reject(
            PostRejectionKind.AUTHOR_NOT_VERIFIED,
            `${ANONYMITY_NOT_ALLOWED_MESSAGE} Inicia sesión de nuevo para verificar tu identidad con el directorio.`
          );
        case 'topic-not-found':
          return reject(PostRejectionKind.TOPIC_NOT_FOUND, 'El tema no existe o fue retirado.');
        case 'topic-restricted':
          await audit.record({
            kind: 'topic-access-denied',
            operation: 'publish',
            studentEmail: email,
            studentProgramId: author?.programId ?? null,
            topicId: input.topicId,
            occurredAt: now
          });
          return reject(PostRejectionKind.TOPIC_RESTRICTED, 'Este tema está restringido a otros programas.');
        case 'sanctioned':
          return reject(
            PostRejectionKind.SANCTIONED,
            `Tienes una sanción activa en el foro hasta el ${formatSanctionEnd(decision.sanctionEndsAt)}.`,
            { sanctionEndsAt: decision.sanctionEndsAt }
          );
      }
    }

    // `decidePublication` solo autoriza con autor verificado y tema activo.
    const postId = ids.newId();

    // HU-31: antes de hacerse visible, el texto se analiza (sin datos del autor) y se decide. Ver `ScreenContent`.
    const moderation = await this.dependencies.moderate.execute({
      title: content.title,
      text: content.text,
      author: { name: author!.name, email: author!.email },
      // HU-52: la decisión queda registrada contra este contenido, también si se publica.
      content: { id: postId, kind: 'post' }
    });
    if (moderation.verdict !== ModerationVerdict.PUBLISH) {
      return this.holdBack(moderation, {
        id: postId,
        topicId: topic!.id,
        author: { email: author!.email, name: author!.name, programName: author!.programName, programId: author!.programId },
        title: content.title,
        text: content.text,
        now
      });
    }

    const post = {
      id: postId,
      topicId: topic!.id,
      author: { email: author!.email, name: author!.name, programName: author!.programName, programId: author!.programId },
      // HU-47, criterio 7: neutraliza marcado/scripts embebidos antes de persistir (ver hardening/domain/services/HtmlEncoding.ts).
      title: neutralizeHtml(content.title),
      text: neutralizeHtml(content.text),
      publishedAt: now
    };
    await posts.save(post);
    return { ok: true, post: toPostView(post) };
  }

  /** Retiene o bloquea (HU-31 criterios 4 a 6). Nada de esto llega a `forum_posts`. */
  private async holdBack(
    decision: ModerationDecision,
    submission: {
      readonly id: string;
      readonly topicId: string;
      readonly author: { readonly email: string; readonly name: string; readonly programName: string; readonly programId: string | null };
      readonly title: string;
      readonly text: string;
      readonly now: Date;
    }
  ): Promise<CreatePostResult> {
    const { reviewQueue, recordInfraction, decisions } = this.dependencies;
    const retained = decision.verdict === ModerationVerdict.RETAIN;

    if (retained) {
      await reviewQueue.enqueue({
        id: submission.id,
        kind: 'post',
        topicId: submission.topicId,
        author: submission.author,
        // Se guarda ya neutralizado: quien lo revise nunca ve marcado activo (HU-47 criterio 7).
        title: neutralizeHtml(submission.title),
        text: neutralizeHtml(submission.text),
        reason: decision.reason,
        score: decision.score,
        retainedAt: submission.now
      });
    }
    // Un retenido queda como `retained` (no computa para sancionar); un bloqueado suma al historial de HU-35.
    await recordInfraction.execute({
      studentEmail: submission.author.email,
      content: { kind: 'post', id: submission.id, topicId: submission.topicId, title: submission.title, text: submission.text },
      outcome: retained ? InfractionOutcome.RETAINED : InfractionOutcome.BLOCKED,
      reason: infractionReason(decision),
      detectedBy: AUTOMATIC_MODERATION_DETECTOR
    });
    // Si esto falla el contenido ya está retenido o bloqueado: es fail-safe, solo se pierde el aviso.
    await decisions.execute({
      contentId: submission.id,
      contentKind: 'post',
      authorEmail: submission.author.email,
      verdict: retained ? 'retain' : 'block',
      // La política automática no clasifica el tipo de infracción: se usa la norma general hasta que exista una clasificación por categoría.
      category: GENERAL_MODERATION_CATEGORY,
      fragment: neutralizeHtml(submission.text).slice(0, MODERATION_FRAGMENT_MAX_LENGTH),
      detectedBy: AUTOMATIC_MODERATION_DETECTOR,
      internalDetail: { reason: decision.reason, score: decision.score }
    });
    return retained
      ? reject(PostRejectionKind.RETAINED_FOR_REVIEW, RETAINED_FOR_REVIEW_MESSAGE)
      : reject(PostRejectionKind.BLOCKED_BY_MODERATION, BLOCKED_BY_MODERATION_MESSAGE);
  }
}

const GENERAL_MODERATION_CATEGORY = 'other';
const MODERATION_FRAGMENT_MAX_LENGTH = 200;

function infractionReason(decision: ModerationDecision): string {
  switch (decision.reason) {
    case ModerationReason.BANNED_TERM:
      return 'Coincidencia con el diccionario de términos vetados.';
    case ModerationReason.ABOVE_UPPER_THRESHOLD:
      return `Lenguaje ofensivo detectado por la moderación automática (puntaje ${decision.score}).`;
    case ModerationReason.BETWEEN_THRESHOLDS:
      return `Posible lenguaje ofensivo, pendiente de revisión humana (puntaje ${decision.score}).`;
    case ModerationReason.SERVICE_UNAVAILABLE:
      return 'Retenido sin análisis: el servicio de moderación no respondió.';
    default:
      return 'Retenido: la moderación automática no pudo evaluar el texto.';
  }
}

function reject(
  error: PostRejectionKind,
  message: string,
  extra: { readonly fields?: readonly string[]; readonly sanctionEndsAt?: Date } = {}
): CreatePostResult {
  return { ok: false, error, message, ...extra };
}
