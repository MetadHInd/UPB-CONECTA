import {
  confirmCase,
  reportCaseIdFor,
  ReportCaseStatus,
  restoreCase,
  ReviewDecision,
  type ContentReportCase,
  type ReportedContentKind
} from '../domain/entities/ContentReportCase.js';
import { reportOutcomeId, type ReportAbuseFlag, type ReportOutcomeKind } from '../domain/entities/ReportAbuse.js';
import type { ReportPolicy } from '../domain/value-objects/ReportPolicy.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { InfractionRecorderPort } from '../domain/ports/out/InfractionRecorderPort.js';
import type { ReportAbuseFlagRepositoryPort } from '../domain/ports/out/ReportAbuseFlagRepositoryPort.js';
import type { ReportAuditPort } from '../domain/ports/out/ReportAuditPort.js';
import type { ReportCaseRepositoryPort } from '../domain/ports/out/ReportCaseRepositoryPort.js';
import type { ReportOutcomeRepositoryPort } from '../domain/ports/out/ReportOutcomeRepositoryPort.js';
import type { ReportedContentPort } from '../domain/ports/out/ReportedContentPort.js';

export enum ReportReviewFailureKind {
  REASON_REQUIRED = 'reason-required',
  INVALID_DECISION = 'invalid-decision',
  CASE_NOT_FOUND = 'case-not-found',
  NOTHING_TO_REVIEW = 'nothing-to-review',
  ALREADY_CONFIRMED = 'already-confirmed',
  INFRACTION_REJECTED = 'infraction-rejected'
}

export interface ReviewReportedContentInput {
  readonly kind: ReportedContentKind;
  readonly contentId: string;
  readonly decision: ReviewDecision;
  readonly reason: string;
  /** Administrador; lo provee el control de acceso de HU-46. */
  readonly performedBy: string;
}

export type ReviewReportedContentResult =
  | {
      readonly ok: true;
      readonly decision: ReviewDecision;
      readonly reportCase: ContentReportCase;
      /** Nivel de sancion que la confirmacion disparo en HU-35, si alguno. */
      readonly sanctionLevel: string | null;
      /** Cuentas marcadas por patron de reportes infundados en esta decision (criterio 6). */
      readonly abuseFlagged: readonly string[];
    }
  | { readonly ok: false; readonly error: ReportReviewFailureKind; readonly message: string };

/** Quien detecto la infraccion en el historial de HU-35. */
export const COMMUNITY_REPORTS_DETECTOR = 'community-reports';

/**
 * El administrador revisa un contenido reportado u ocultado preventivamente
 * (HU-34 criterios 5 y 6): lo restaura o confirma la infraccion. La decision
 * queda auditada con su autor y su motivo. Confirmar registra la infraccion en
 * el historial de HU-35 (que decide la sancion gradual) y deja el contenido
 * oculto; restaurar reinicia el contador y anota los reportes como infundados,
 * lo que alimenta la deteccion de abuso.
 *
 * Operacion de administrador de contenido: declarada en
 * `config/protected-operations.json`.
 *
 * Fail-safe: al restaurar, el caso se actualiza antes de volver a mostrar el
 * contenido, asi que un fallo intermedio deja el contenido oculto.
 */
export class ReviewReportedContent {
  constructor(
    private readonly dependencies: {
      readonly cases: ReportCaseRepositoryPort;
      readonly contents: ReportedContentPort;
      readonly infractions: InfractionRecorderPort;
      readonly outcomes: ReportOutcomeRepositoryPort;
      readonly abuseFlags: ReportAbuseFlagRepositoryPort;
      readonly audit: ReportAuditPort;
      readonly clock: ClockPort;
      readonly policy: ReportPolicy;
    }
  ) {}

  async execute(input: ReviewReportedContentInput): Promise<ReviewReportedContentResult> {
    const { cases, contents, infractions, audit, clock } = this.dependencies;
    const reason = input.reason.trim();
    if (reason === '') return fail(ReportReviewFailureKind.REASON_REQUIRED, 'La decisión exige un motivo: queda en la auditoría.');
    if (input.decision !== ReviewDecision.RESTORE && input.decision !== ReviewDecision.CONFIRM_INFRACTION) {
      return fail(ReportReviewFailureKind.INVALID_DECISION, 'La decisión debe ser restaurar o confirmar la infracción.');
    }

    const current = await cases.findById(reportCaseIdFor({ kind: input.kind, id: input.contentId }));
    if (current === null) return fail(ReportReviewFailureKind.CASE_NOT_FOUND, 'Ese contenido no tiene reportes.');
    if (current.status === ReportCaseStatus.INFRACTION_CONFIRMED) {
      return fail(ReportReviewFailureKind.ALREADY_CONFIRMED, 'La infracción de este contenido ya fue confirmada.');
    }
    if (current.reports.length === 0 && current.status === ReportCaseStatus.OPEN) {
      return fail(ReportReviewFailureKind.NOTHING_TO_REVIEW, 'Ese contenido no tiene reportes pendientes.');
    }

    const now = clock.now();
    const decision = { decidedBy: input.performedBy, reason, now };
    let sanctionLevel: string | null = null;
    let next: ContentReportCase;
    let outcome: ReportOutcomeKind;

    if (input.decision === ReviewDecision.CONFIRM_INFRACTION) {
      const recorded = await infractions.recordBlocked({
        studentEmail: current.authorEmail,
        content: current.content,
        reason,
        detectedBy: COMMUNITY_REPORTS_DETECTOR
      });
      if (!recorded.ok) return fail(ReportReviewFailureKind.INFRACTION_REJECTED, recorded.message);
      sanctionLevel = recorded.sanctionLevel;
      next = confirmCase(current, decision);
      outcome = 'founded';
      await cases.update(next);
      await contents.setHidden(input.kind, input.contentId, true);
    } else {
      next = restoreCase(current, decision);
      outcome = 'unfounded';
      await cases.update(next);
      await contents.setHidden(input.kind, input.contentId, false);
    }

    await audit.record({
      kind: 'report-review-decided',
      caseId: current.id,
      decision: input.decision,
      reason,
      performedBy: input.performedBy,
      occurredAt: now
    });
    const abuseFlagged = await this.recordOutcomes(current, outcome, now);
    return { ok: true, decision: input.decision, reportCase: next, sanctionLevel, abuseFlagged };
  }

  /** Anota el resultado de cada reportante de la ronda y marca a quien acumule infundados (criterio 6). */
  private async recordOutcomes(closed: ContentReportCase, outcome: ReportOutcomeKind, now: Date): Promise<readonly string[]> {
    const { outcomes } = this.dependencies;
    const flagged: string[] = [];
    for (const report of closed.reports) {
      await outcomes.record({
        id: reportOutcomeId(closed.id, now, report.reporterEmail),
        reporterEmail: report.reporterEmail,
        caseId: closed.id,
        outcome,
        decidedAt: now
      });
      if (outcome === 'unfounded' && (await this.flagIfAbusive(report.reporterEmail, closed.id, now))) flagged.push(report.reporterEmail);
    }
    return flagged;
  }

  private async flagIfAbusive(reporterEmail: string, caseId: string, now: Date): Promise<boolean> {
    const { outcomes, abuseFlags, audit, policy } = this.dependencies;
    const since = now.getTime() - policy.abuseWindowMs;
    const unfounded = (await outcomes.findByReporter(reporterEmail)).filter(
      (entry) => entry.outcome === 'unfounded' && entry.decidedAt.getTime() >= since
    );
    if (unfounded.length < policy.abuseThreshold) return false;

    const existing = await abuseFlags.findByReporter(reporterEmail);
    const flag: ReportAbuseFlag = {
      reporterEmail,
      unfoundedCount: unfounded.length,
      windowDays: policy.values.abuse.windowDays,
      caseIds: [...new Set(unfounded.map((entry) => entry.caseId))],
      flaggedAt: existing?.flaggedAt ?? now,
      updatedAt: now,
      status: 'open'
    };
    await abuseFlags.save(flag);
    await audit.record({ kind: 'report-abuse-flagged', reporterEmail, unfoundedCount: flag.unfoundedCount, caseId, performedBy: 'system', occurredAt: now });
    return true;
  }
}

function fail(error: ReportReviewFailureKind, message: string): ReviewReportedContentResult {
  return { ok: false, error, message };
}
