import type { ReportPolicy } from '../value-objects/ReportPolicy.js';

export type ReportedContentKind = 'post' | 'comment';

/**
 * Estado del contenido reportado (HU-34). `open`: visible, con o sin reportes
 * pendientes. `hidden-preventively`: el contador de reportes cruzo el umbral y
 * espera al administrador. `infraction-confirmed`: estado final; sigue oculto.
 */
export enum ReportCaseStatus {
  OPEN = 'open',
  HIDDEN_PREVENTIVELY = 'hidden-preventively',
  INFRACTION_CONFIRMED = 'infraction-confirmed'
}

export enum ReviewDecision {
  RESTORE = 'restore',
  CONFIRM_INFRACTION = 'confirm-infraction'
}

/** Un reporte: asociado al contenido (por el caso), a la causa y al reportante (criterio 2). */
export interface ContentReport {
  /** Normalizado. Solo lo ven los administradores; nunca el autor del contenido. */
  readonly reporterEmail: string;
  readonly causeId: string;
  readonly detail: string | null;
  readonly reportedAt: Date;
}

/** Ronda ya resuelta: se conserva para el historial y para evaluar el abuso. */
export interface ReviewedRound {
  readonly reports: readonly ContentReport[];
  readonly decision: 'restored' | 'infraction-confirmed';
  readonly decidedBy: string;
  readonly reason: string;
  readonly decidedAt: Date;
}

export interface ReportedContentSnapshot {
  readonly kind: ReportedContentKind;
  readonly id: string;
  readonly topicId: string;
  readonly title: string | null;
  readonly text: string;
}

/**
 * Caso de reportes de un contenido: el contador de dominio que dispara la
 * transicion de estado del contenido (criterio 4). Uno por contenido.
 */
export interface ContentReportCase {
  /** `kind:id` del contenido. */
  readonly id: string;
  readonly content: ReportedContentSnapshot;
  /** Autor del contenido, para la infraccion de HU-35; nunca en vistas para el autor. */
  readonly authorEmail: string;
  readonly status: ReportCaseStatus;
  /** Reportes de la ronda en curso, uno por reportante. */
  readonly reports: readonly ContentReport[];
  readonly history: readonly ReviewedRound[];
  readonly hiddenAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export function reportCaseIdFor(content: Pick<ReportedContentSnapshot, 'kind' | 'id'>): string {
  return `${content.kind}:${content.id}`;
}

export function newReportCase(input: { content: ReportedContentSnapshot; authorEmail: string; now: Date }): ContentReportCase {
  return {
    id: reportCaseIdFor(input.content),
    content: input.content,
    authorEmail: input.authorEmail,
    status: ReportCaseStatus.OPEN,
    reports: [],
    history: [],
    hiddenAt: null,
    createdAt: input.now,
    updatedAt: input.now
  };
}

/** Cuantos reportantes distintos hay en la ronda actual: un mismo usuario cuenta una vez (criterio 3). */
export function distinctReporterCount(reportCase: Pick<ContentReportCase, 'reports'>): number {
  return new Set(reportCase.reports.map((report) => report.reporterEmail)).size;
}

export function hasReportFrom(reportCase: Pick<ContentReportCase, 'reports'>, reporterEmail: string): boolean {
  return reportCase.reports.some((report) => report.reporterEmail === reporterEmail);
}

/** Agrega un reporte a la ronda; si el reportante ya estaba, no cambia nada (criterio 3). */
export function withReport(reportCase: ContentReportCase, report: ContentReport): ContentReportCase {
  if (hasReportFrom(reportCase, report.reporterEmail)) return reportCase;
  return { ...reportCase, reports: [...reportCase.reports, report], updatedAt: report.reportedAt };
}

/** Transicion `open -> hidden-preventively` disparada por el contador (criterio 4). */
export function shouldHidePreventively(reportCase: ContentReportCase, policy: ReportPolicy): boolean {
  return reportCase.status === ReportCaseStatus.OPEN && distinctReporterCount(reportCase) >= policy.hideThreshold;
}

export function hidePreventively(reportCase: ContentReportCase, now: Date): ContentReportCase {
  return { ...reportCase, status: ReportCaseStatus.HIDDEN_PREVENTIVELY, hiddenAt: reportCase.hiddenAt ?? now, updatedAt: now };
}

interface DecisionInput {
  readonly decidedBy: string;
  readonly reason: string;
  readonly now: Date;
}

/**
 * El administrador restaura: el contenido vuelve a ser visible y el contador
 * arranca de cero, asi que hacen falta reportes nuevos para ocultarlo otra vez.
 */
export function restoreCase(reportCase: ContentReportCase, decision: DecisionInput): ContentReportCase {
  return {
    ...reportCase,
    status: ReportCaseStatus.OPEN,
    reports: [],
    history: [...reportCase.history, closeRound(reportCase, 'restored', decision)],
    hiddenAt: null,
    updatedAt: decision.now
  };
}

export function confirmCase(reportCase: ContentReportCase, decision: DecisionInput): ContentReportCase {
  return {
    ...reportCase,
    status: ReportCaseStatus.INFRACTION_CONFIRMED,
    reports: [],
    history: [...reportCase.history, closeRound(reportCase, 'infraction-confirmed', decision)],
    hiddenAt: reportCase.hiddenAt ?? decision.now,
    updatedAt: decision.now
  };
}

function closeRound(reportCase: ContentReportCase, decision: ReviewedRound['decision'], by: DecisionInput): ReviewedRound {
  return { reports: reportCase.reports, decision, decidedBy: by.decidedBy, reason: by.reason, decidedAt: by.now };
}

/**
 * Lo unico que el autor puede saber (criterio 2): si su contenido esta oculto
 * a la espera de revision. Ni cuantos reportes, ni causas, ni reportantes.
 */
export interface AuthorContentStatusView {
  readonly contentId: string;
  readonly kind: ReportedContentKind;
  readonly state: 'visible' | 'hidden-under-review' | 'removed';
}

export function toAuthorStatusView(reportCase: ContentReportCase): AuthorContentStatusView {
  const state =
    reportCase.status === ReportCaseStatus.OPEN
      ? 'visible'
      : reportCase.status === ReportCaseStatus.HIDDEN_PREVENTIVELY
        ? 'hidden-under-review'
        : 'removed';
  return { contentId: reportCase.content.id, kind: reportCase.content.kind, state };
}
