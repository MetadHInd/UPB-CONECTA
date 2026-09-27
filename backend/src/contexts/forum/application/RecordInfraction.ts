import { normalizeForumEmail } from '../domain/entities/ForumAuthor.js';
import {
  INFRACTION_LIMITS,
  InfractionOutcome,
  infractionIdFor,
  type Infraction,
  type ModeratedContentSnapshot
} from '../domain/entities/Infraction.js';
import type { SanctionRecord } from '../domain/entities/Sanction.js';
import { sanctionDurationText, sanctionImposedMessage } from '../domain/services/SanctionMessages.js';
import { SanctionPolicy } from '../domain/services/SanctionPolicy.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { ForumIdGeneratorPort } from '../domain/ports/out/ForumIdGeneratorPort.js';
import type { InfractionRepositoryPort } from '../domain/ports/out/InfractionRepositoryPort.js';
import type { SanctionAuditPort } from '../domain/ports/out/SanctionAuditPort.js';
import type { SanctionNotificationPort } from '../domain/ports/out/SanctionNotificationPort.js';
import type { SanctionRepositoryPort } from '../domain/ports/out/SanctionRepositoryPort.js';
import type { SanctionThresholdsRepositoryPort } from '../domain/ports/out/SanctionThresholdsRepositoryPort.js';

export enum InfractionRejectionKind {
  INVALID_INFRACTION = 'invalid-infraction',
  CONTENT_OWNER_MISMATCH = 'content-owner-mismatch'
}

export interface RecordInfractionInput {
  /** Autor del contenido moderado, tal como lo guarda la publicacion (`author.email`). */
  readonly studentEmail: string;
  readonly content: ModeratedContentSnapshot;
  readonly outcome: InfractionOutcome;
  readonly reason: string;
  readonly detectedBy: string;
}

/**
 * `created`: primera vez que se modera ese contenido. `escalated`: estaba
 * retenido y ahora se bloquea. `unchanged`: reintento o una retencion sobre
 * algo ya registrado; no cuenta dos veces.
 */
export type InfractionRecordStatus = 'created' | 'escalated' | 'unchanged';

export type RecordInfractionResult =
  | {
      readonly ok: true;
      readonly status: InfractionRecordStatus;
      readonly infraction: Infraction;
      readonly sanction: SanctionRecord | null;
    }
  | { readonly ok: false; readonly error: InfractionRejectionKind; readonly message: string };

/**
 * Registra el resultado de moderar un contenido y, si con el el estudiante
 * cambia de escalon, impone la sancion que corresponde (HU-35 criterios 1 y
 * 2; CU-03 flujo alternativo C). Lo invoca la moderacion (automatica en
 * HU-31, por reportes en HU-34, o un administrador), no el estudiante: es un
 * puerto de entrada interno, no una operacion HTTP.
 */
export class RecordInfraction {
  constructor(
    private readonly dependencies: {
      readonly infractions: InfractionRepositoryPort;
      readonly sanctions: SanctionRepositoryPort;
      readonly thresholds: SanctionThresholdsRepositoryPort;
      readonly notifications: SanctionNotificationPort;
      readonly audit: SanctionAuditPort;
      readonly clock: ClockPort;
      readonly ids: ForumIdGeneratorPort;
    }
  ) {}

  async execute(input: RecordInfractionInput): Promise<RecordInfractionResult> {
    const invalid = validate(input);
    if (invalid !== null) return { ok: false, error: InfractionRejectionKind.INVALID_INFRACTION, message: invalid };

    const { infractions } = this.dependencies;
    const now = this.dependencies.clock.now();
    const email = normalizeForumEmail(input.studentEmail);
    const incoming: Infraction = {
      id: infractionIdFor(input.content),
      studentEmail: email,
      content: { ...input.content, text: input.content.text.trim(), title: input.content.title?.trim() ?? null },
      outcome: input.outcome,
      reason: input.reason.trim(),
      detectedBy: input.detectedBy.trim(),
      occurredAt: now
    };

    const existing = await infractions.findById(incoming.id);
    if (existing !== null && existing.studentEmail !== email) {
      return {
        ok: false,
        error: InfractionRejectionKind.CONTENT_OWNER_MISMATCH,
        message: 'Ese contenido ya está registrado a nombre de otro estudiante.'
      };
    }

    let infraction: Infraction;
    let status: InfractionRecordStatus;
    if (existing === null) {
      if (!(await infractions.create(incoming))) {
        // Otra instancia lo registro entre la lectura y la escritura: es un reintento.
        return { ok: true, status: 'unchanged', infraction: (await infractions.findById(incoming.id)) ?? incoming, sanction: null };
      }
      infraction = incoming;
      status = 'created';
    } else if (existing.outcome === InfractionOutcome.RETAINED && incoming.outcome === InfractionOutcome.BLOCKED) {
      // La ventana de computo cuenta desde que la moderacion confirmo el bloqueo.
      infraction = { ...existing, outcome: incoming.outcome, reason: incoming.reason, detectedBy: incoming.detectedBy, occurredAt: now };
      await infractions.update(infraction);
      status = 'escalated';
    } else {
      return { ok: true, status: 'unchanged', infraction: existing, sanction: null };
    }

    const sanction = infraction.outcome === InfractionOutcome.BLOCKED ? await this.sanctionIfDue(infraction, now) : null;
    return { ok: true, status, infraction, sanction };
  }

  private async sanctionIfDue(trigger: Infraction, now: Date): Promise<SanctionRecord | null> {
    const { infractions, sanctions, thresholds, notifications, audit, ids } = this.dependencies;
    const [history, previous, stored] = await Promise.all([
      infractions.findByStudent(trigger.studentEmail),
      sanctions.findSanctions(trigger.studentEmail),
      thresholds.get()
    ]);

    const decision = new SanctionPolicy(stored.thresholds).decide({ trigger, infractions: history, sanctions: previous, now });
    if (decision === null) return null;

    const sanction: SanctionRecord = {
      id: ids.newId(),
      studentEmail: trigger.studentEmail,
      level: decision.level,
      reason: decision.reason,
      startsAt: decision.startsAt,
      endsAt: decision.endsAt,
      revokedAt: null,
      infractionCount: decision.infractionCount,
      triggeredByInfractionId: trigger.id,
      imposedAt: now,
      revocation: null
    };
    await sanctions.save(sanction);
    await audit.record({
      kind: 'sanction-imposed',
      sanctionId: sanction.id,
      studentEmail: sanction.studentEmail,
      level: sanction.level,
      triggeredByInfractionId: trigger.id,
      performedBy: 'system',
      occurredAt: now
    });

    const notice = {
      kind: 'sanction-imposed' as const,
      sanctionId: sanction.id,
      studentEmail: sanction.studentEmail,
      level: sanction.level,
      reason: sanction.reason,
      startsAt: sanction.startsAt,
      endsAt: sanction.endsAt,
      durationText: sanctionDurationText(sanction),
      message: sanctionImposedMessage(sanction)
    };
    await Promise.all([notifications.notifyStudent(notice), notifications.notifyAdministrators(notice)]);
    return sanction;
  }
}

function validate(input: RecordInfractionInput): string | null {
  if (normalizeForumEmail(input.studentEmail) === '') return 'Falta el estudiante autor del contenido.';
  if (!Object.values(InfractionOutcome).includes(input.outcome)) return 'El resultado de moderación debe ser retenido o bloqueado.';
  if (input.content.kind !== 'post' && input.content.kind !== 'comment') return 'El contenido debe ser una publicación o un comentario.';
  if (input.content.id.trim() === '' || input.content.topicId.trim() === '') return 'El contenido debe identificar su id y su tema.';
  if (input.content.text.trim() === '') return 'Falta el texto del contenido moderado.';
  if (input.content.text.trim().length > INFRACTION_LIMITS.textMax) {
    return `El texto del contenido admite hasta ${INFRACTION_LIMITS.textMax} caracteres.`;
  }
  const reason = input.reason.trim();
  if (reason === '') return 'La infracción exige un motivo: sin él la sanción no es sustentable.';
  if (reason.length > INFRACTION_LIMITS.reasonMax) return `El motivo admite hasta ${INFRACTION_LIMITS.reasonMax} caracteres.`;
  if (input.detectedBy.trim() === '') return 'Falta quién detectó la infracción.';
  return null;
}
