export type ReportAuditEvent =
  | {
      readonly kind: 'content-hidden-preventively';
      readonly caseId: string;
      readonly reportCount: number;
      readonly performedBy: 'system';
      readonly occurredAt: Date;
    }
  | {
      readonly kind: 'report-review-decided';
      readonly caseId: string;
      readonly decision: 'restore' | 'confirm-infraction';
      readonly reason: string;
      readonly performedBy: string;
      readonly occurredAt: Date;
    }
  | {
      readonly kind: 'report-abuse-flagged';
      readonly reporterEmail: string;
      readonly unfoundedCount: number;
      readonly caseId: string;
      readonly performedBy: 'system';
      readonly occurredAt: Date;
    };

/** Auditoria append-only de las decisiones de reportes (HU-34 criterios 5 y 6). */
export interface ReportAuditPort {
  record(event: ReportAuditEvent): Promise<void>;
}
