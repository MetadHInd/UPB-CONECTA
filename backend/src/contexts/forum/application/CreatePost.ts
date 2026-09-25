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
import { ForumAccessPolicy } from '../domain/services/ForumAccessPolicy.js';
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
  SANCTIONED = 'sanctioned'
}

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

const SANCTION_DATE_FORMAT = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'America/Bogota'
});

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
            `Tienes una sanción activa en el foro hasta el ${SANCTION_DATE_FORMAT.format(decision.sanctionEndsAt)} (hora de Colombia).`,
            { sanctionEndsAt: decision.sanctionEndsAt }
          );
      }
    }

    // `decidePublication` solo autoriza con autor verificado y tema activo.
    const post = {
      id: ids.newId(),
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
}

function reject(
  error: PostRejectionKind,
  message: string,
  extra: { readonly fields?: readonly string[]; readonly sanctionEndsAt?: Date } = {}
): CreatePostResult {
  return { ok: false, error, message, ...extra };
}
