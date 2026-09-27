import {
  distinctReporterCount,
  hidePreventively,
  newReportCase,
  reportCaseIdFor,
  ReportCaseStatus,
  shouldHidePreventively,
  type ContentReport,
  type ReportedContentKind
} from '../domain/entities/ContentReportCase.js';
import { REPORT_DETAIL_MAX, type ReportPolicy } from '../domain/value-objects/ReportPolicy.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { ReportAuditPort } from '../domain/ports/out/ReportAuditPort.js';
import type { ReportCaseRepositoryPort } from '../domain/ports/out/ReportCaseRepositoryPort.js';
import type { ReportedContentPort } from '../domain/ports/out/ReportedContentPort.js';

export enum ReportRejectionKind {
  INVALID_REPORT = 'invalid-report',
  UNKNOWN_CAUSE = 'unknown-cause',
  CONTENT_NOT_FOUND = 'content-not-found',
  CONTENT_NOT_VISIBLE = 'content-not-visible',
  OWN_CONTENT = 'own-content'
}

export interface ReportContentInput {
  /** Sujeto de la sesion verificada (HU-45); nunca un valor que el cliente elija. */
  readonly reporterEmail: string;
  readonly kind: ReportedContentKind;
  readonly contentId: string;
  readonly causeId: string;
  readonly detail?: string;
}

/**
 * `queued`: el reporte quedo en la cola del administrador. `duplicate`: ese
 * usuario ya habia reportado ese contenido; cuenta como uno solo (criterio 3).
 */
export type ReportContentResult =
  | { readonly ok: true; readonly status: 'queued' | 'duplicate'; readonly hiddenPreventively: boolean }
  | { readonly ok: false; readonly error: ReportRejectionKind; readonly message: string };

/**
 * Reportar una publicacion o comentario visible (HU-34 criterios 1 a 4).
 * Cada reporte asocia contenido, causa y reportante (criterio 2); un mismo
 * reportante cuenta una vez (criterio 3); al alcanzar el umbral configurable
 * el contenido se oculta hasta que un administrador lo revise (criterio 4).
 *
 * Fail-safe (RNF-11): el caso se persiste como oculto ANTES de ocultar el
 * contenido, y cualquier reporte posterior sobre un caso oculto vuelve a
 * ocultar el contenido (idempotente). Si el foro falla al ocultar, el
 * siguiente intento converge a oculto, nunca a visible.
 */
export class ReportContent {
  constructor(
    private readonly dependencies: {
      readonly cases: ReportCaseRepositoryPort;
      readonly contents: ReportedContentPort;
      readonly audit: ReportAuditPort;
      readonly clock: ClockPort;
      readonly policy: ReportPolicy;
    }
  ) {}

  async execute(input: ReportContentInput): Promise<ReportContentResult> {
    const { cases, contents, audit, clock, policy } = this.dependencies;
    const reporterEmail = input.reporterEmail.trim().toLowerCase();
    const contentId = input.contentId.trim();
    if (reporterEmail === '' || contentId === '') return reject(ReportRejectionKind.INVALID_REPORT, 'Indica quién reporta y qué contenido.');
    if (input.kind !== 'post' && input.kind !== 'comment') {
      return reject(ReportRejectionKind.INVALID_REPORT, 'Solo se pueden reportar publicaciones o comentarios.');
    }

    const cause = policy.findCause(input.causeId);
    if (cause === null) return reject(ReportRejectionKind.UNKNOWN_CAUSE, 'Indica una de las causas de reporte disponibles.');
    const detail = input.detail?.trim() ?? '';
    if (cause.requiresDetail === true && detail === '') {
      return reject(ReportRejectionKind.INVALID_REPORT, 'Esta causa exige que expliques el motivo.');
    }
    if (detail.length > REPORT_DETAIL_MAX) {
      return reject(ReportRejectionKind.INVALID_REPORT, `La explicación admite hasta ${REPORT_DETAIL_MAX} caracteres.`);
    }

    const content = await contents.find(input.kind, contentId);
    if (content === null) return reject(ReportRejectionKind.CONTENT_NOT_FOUND, 'El contenido no existe.');
    if (content.authorEmail.trim().toLowerCase() === reporterEmail) {
      return reject(ReportRejectionKind.OWN_CONTENT, 'No puedes reportar tu propio contenido.');
    }

    const caseId = reportCaseIdFor({ kind: input.kind, id: contentId });
    let reportCase = await cases.findById(caseId);
    if (reportCase !== null && reportCase.status !== ReportCaseStatus.OPEN) {
      // Ya en revision: converger a oculto por si la ocultacion anterior fallo a medias.
      await contents.setHidden(input.kind, contentId, true);
      return reject(ReportRejectionKind.CONTENT_NOT_VISIBLE, 'Este contenido ya está en revisión por un administrador.');
    }
    if (content.hidden && reportCase === null) {
      return reject(ReportRejectionKind.CONTENT_NOT_VISIBLE, 'Este contenido no está visible.');
    }

    const now = clock.now();
    if (reportCase === null) {
      const fresh = newReportCase({
        content: { kind: content.kind, id: content.id, topicId: content.topicId, title: content.title, text: content.text },
        authorEmail: content.authorEmail.trim().toLowerCase(),
        now
      });
      await cases.create(fresh);
    }

    const report: ContentReport = { reporterEmail, causeId: cause.id, detail: detail === '' ? null : detail, reportedAt: now };
    const added = await cases.addReport(caseId, report);
    reportCase = await cases.findById(caseId);
    if (reportCase === null) throw new Error(`El caso de reportes ${caseId} desapareció tras registrar el reporte.`);
    if (!added) return { ok: true, status: 'duplicate', hiddenPreventively: reportCase.status !== ReportCaseStatus.OPEN };

    if (!shouldHidePreventively(reportCase, policy)) return { ok: true, status: 'queued', hiddenPreventively: false };

    const hidden = hidePreventively(reportCase, now);
    await cases.update(hidden);
    await contents.setHidden(input.kind, contentId, true);
    await audit.record({
      kind: 'content-hidden-preventively',
      caseId,
      reportCount: distinctReporterCount(hidden),
      performedBy: 'system',
      occurredAt: now
    });
    return { ok: true, status: 'queued', hiddenPreventively: true };
  }
}

function reject(error: ReportRejectionKind, message: string): ReportContentResult {
  return { ok: false, error, message };
}
