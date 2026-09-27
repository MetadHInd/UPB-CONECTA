import type { ContentReport, ContentReportCase } from '../../../../domain/entities/ContentReportCase.js';
import { ReportCaseStatus } from '../../../../domain/entities/ContentReportCase.js';
import type { ReportAbuseFlag, ReportOutcome } from '../../../../domain/entities/ReportAbuse.js';
import type { ReportAbuseFlagRepositoryPort } from '../../../../domain/ports/out/ReportAbuseFlagRepositoryPort.js';
import type { ReportAuditEvent, ReportAuditPort } from '../../../../domain/ports/out/ReportAuditPort.js';
import type { ReportCaseRepositoryPort } from '../../../../domain/ports/out/ReportCaseRepositoryPort.js';
import type { ReportOutcomeRepositoryPort } from '../../../../domain/ports/out/ReportOutcomeRepositoryPort.js';

export class InMemoryReportCaseRepository implements ReportCaseRepositoryPort {
  private readonly cases = new Map<string, ContentReportCase>();

  async findById(id: string): Promise<ContentReportCase | null> {
    const found = this.cases.get(id);
    return found === undefined ? null : structuredClone(found);
  }

  async create(reportCase: ContentReportCase): Promise<boolean> {
    if (this.cases.has(reportCase.id)) return false;
    this.cases.set(reportCase.id, structuredClone(reportCase));
    return true;
  }

  async addReport(caseId: string, report: ContentReport): Promise<boolean> {
    const found = this.cases.get(caseId);
    if (found === undefined || found.reports.some((entry) => entry.reporterEmail === report.reporterEmail)) return false;
    this.cases.set(caseId, { ...found, reports: [...found.reports, structuredClone(report)], updatedAt: report.reportedAt });
    return true;
  }

  async update(reportCase: ContentReportCase): Promise<void> {
    this.cases.set(reportCase.id, structuredClone(reportCase));
  }

  async findPendingReview(): Promise<readonly ContentReportCase[]> {
    return [...this.cases.values()]
      .filter((entry) => entry.reports.length > 0 || entry.status === ReportCaseStatus.HIDDEN_PREVENTIVELY)
      .map((entry) => structuredClone(entry));
  }
}

export class InMemoryReportOutcomeRepository implements ReportOutcomeRepositoryPort {
  private readonly outcomes = new Map<string, ReportOutcome>();

  async record(outcome: ReportOutcome): Promise<void> {
    if (!this.outcomes.has(outcome.id)) this.outcomes.set(outcome.id, outcome);
  }

  async findByReporter(email: string): Promise<readonly ReportOutcome[]> {
    return [...this.outcomes.values()].filter((entry) => entry.reporterEmail === email);
  }
}

export class InMemoryReportAbuseFlagRepository implements ReportAbuseFlagRepositoryPort {
  private readonly flags = new Map<string, ReportAbuseFlag>();

  async findByReporter(email: string): Promise<ReportAbuseFlag | null> {
    return this.flags.get(email) ?? null;
  }

  async save(flag: ReportAbuseFlag): Promise<void> {
    this.flags.set(flag.reporterEmail, flag);
  }

  async findOpen(): Promise<readonly ReportAbuseFlag[]> {
    return [...this.flags.values()].filter((flag) => flag.status === 'open');
  }
}

export class InMemoryReportAuditLog implements ReportAuditPort {
  private readonly recorded: ReportAuditEvent[] = [];

  get events(): readonly ReportAuditEvent[] {
    return this.recorded;
  }

  async record(event: ReportAuditEvent): Promise<void> {
    this.recorded.push(event);
  }
}
