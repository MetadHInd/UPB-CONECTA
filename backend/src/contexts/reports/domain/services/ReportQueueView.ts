import {
  distinctReporterCount,
  ReportCaseStatus,
  type ContentReportCase,
  type ReportedContentKind
} from '../entities/ContentReportCase.js';
import type { ReportPolicy } from '../value-objects/ReportPolicy.js';

/** Vista para el administrador (criterio 1): incluye reportantes, que el autor nunca ve (criterio 2). */
export interface ReportQueueItem {
  readonly caseId: string;
  readonly kind: ReportedContentKind;
  readonly contentId: string;
  readonly topicId: string;
  readonly title: string | null;
  readonly text: string;
  readonly status: ReportCaseStatus;
  readonly reportCount: number;
  readonly causes: readonly { readonly causeId: string; readonly label: string; readonly count: number }[];
  readonly reporters: readonly string[];
  readonly firstReportedAt: Date;
  readonly hiddenAt: Date | null;
}

/** Ocultos primero (ya no se ven), luego por mas reportes y, a igualdad, el mas antiguo. */
export function buildReportQueue(cases: readonly ContentReportCase[], policy: ReportPolicy): readonly ReportQueueItem[] {
  return cases
    .filter((reportCase) => reportCase.reports.length > 0 || reportCase.status === ReportCaseStatus.HIDDEN_PREVENTIVELY)
    .map((reportCase) => toItem(reportCase, policy))
    .sort(
      (a, b) =>
        Number(b.status === ReportCaseStatus.HIDDEN_PREVENTIVELY) - Number(a.status === ReportCaseStatus.HIDDEN_PREVENTIVELY) ||
        b.reportCount - a.reportCount ||
        a.firstReportedAt.getTime() - b.firstReportedAt.getTime()
    );
}

function toItem(reportCase: ContentReportCase, policy: ReportPolicy): ReportQueueItem {
  const counts = new Map<string, number>();
  for (const report of reportCase.reports) counts.set(report.causeId, (counts.get(report.causeId) ?? 0) + 1);
  const firstReportedAt = reportCase.reports.reduce<Date>(
    (earliest, report) => (report.reportedAt < earliest ? report.reportedAt : earliest),
    reportCase.reports[0]?.reportedAt ?? reportCase.updatedAt
  );
  return {
    caseId: reportCase.id,
    kind: reportCase.content.kind,
    contentId: reportCase.content.id,
    topicId: reportCase.content.topicId,
    title: reportCase.content.title,
    text: reportCase.content.text,
    status: reportCase.status,
    reportCount: distinctReporterCount(reportCase),
    causes: [...counts].map(([causeId, count]) => ({ causeId, label: policy.causeLabel(causeId), count })),
    reporters: reportCase.reports.map((report) => report.reporterEmail),
    firstReportedAt,
    hiddenAt: reportCase.hiddenAt
  };
}
