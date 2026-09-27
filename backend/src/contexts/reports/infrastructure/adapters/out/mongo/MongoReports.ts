import { MongoServerError, type Collection, type Db } from 'mongodb';
import type { ContentReport, ContentReportCase } from '../../../../domain/entities/ContentReportCase.js';
import { ReportCaseStatus } from '../../../../domain/entities/ContentReportCase.js';
import type { ReportAbuseFlag, ReportOutcome } from '../../../../domain/entities/ReportAbuse.js';
import type { ReportAbuseFlagRepositoryPort } from '../../../../domain/ports/out/ReportAbuseFlagRepositoryPort.js';
import type { ReportAuditEvent, ReportAuditPort } from '../../../../domain/ports/out/ReportAuditPort.js';
import type { ReportCaseRepositoryPort } from '../../../../domain/ports/out/ReportCaseRepositoryPort.js';
import type { ReportOutcomeRepositoryPort } from '../../../../domain/ports/out/ReportOutcomeRepositoryPort.js';

const DUPLICATE_KEY = 11000;

type CaseDocument = Omit<ContentReportCase, 'id'> & { _id: string };

function toCase(doc: CaseDocument): ContentReportCase {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

/**
 * Casos de reportes (HU-34). `_id` = `kind:id` del contenido: un caso por
 * contenido. `addReport` filtra por `reports.reporterEmail $ne`, asi que el
 * mismo reportante no se cuenta dos veces ni con peticiones simultaneas.
 */
export class MongoReportCaseRepository implements ReportCaseRepositoryPort {
  static readonly COLLECTION = 'report_cases';

  private readonly collection: Collection<CaseDocument>;

  constructor(db: Db, collectionName = MongoReportCaseRepository.COLLECTION) {
    this.collection = db.collection<CaseDocument>(collectionName);
  }

  static async ensureIndexes(db: Db, collectionName = MongoReportCaseRepository.COLLECTION): Promise<void> {
    await db.collection(collectionName).createIndex({ status: 1, updatedAt: -1 }, { name: 'idx_status_updated' });
  }

  async findById(id: string): Promise<ContentReportCase | null> {
    const doc = await this.collection.findOne({ _id: id });
    return doc ? toCase(doc) : null;
  }

  async create(reportCase: ContentReportCase): Promise<boolean> {
    const { id, ...rest } = reportCase;
    try {
      await this.collection.insertOne({ _id: id, ...rest });
      return true;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === DUPLICATE_KEY) return false;
      throw error;
    }
  }

  async addReport(caseId: string, report: ContentReport): Promise<boolean> {
    const result = await this.collection.updateOne(
      { _id: caseId, 'reports.reporterEmail': { $ne: report.reporterEmail } },
      { $push: { reports: report }, $set: { updatedAt: report.reportedAt } }
    );
    return result.modifiedCount === 1;
  }

  async update(reportCase: ContentReportCase): Promise<void> {
    const { id, ...rest } = reportCase;
    await this.collection.replaceOne({ _id: id }, rest);
  }

  async findPendingReview(): Promise<readonly ContentReportCase[]> {
    const docs = await this.collection
      .find({ $or: [{ 'reports.0': { $exists: true } }, { status: ReportCaseStatus.HIDDEN_PREVENTIVELY }] })
      .toArray();
    return docs.map(toCase);
  }
}

type OutcomeDocument = Omit<ReportOutcome, 'id'> & { _id: string };

export class MongoReportOutcomeRepository implements ReportOutcomeRepositoryPort {
  static readonly COLLECTION = 'report_outcomes';

  private readonly collection: Collection<OutcomeDocument>;

  constructor(db: Db, collectionName = MongoReportOutcomeRepository.COLLECTION) {
    this.collection = db.collection<OutcomeDocument>(collectionName);
  }

  static async ensureIndexes(db: Db, collectionName = MongoReportOutcomeRepository.COLLECTION): Promise<void> {
    await db.collection(collectionName).createIndex({ reporterEmail: 1, decidedAt: -1 }, { name: 'idx_reporter_decided' });
  }

  async record(outcome: ReportOutcome): Promise<void> {
    const { id, ...rest } = outcome;
    await this.collection.updateOne({ _id: id }, { $setOnInsert: rest }, { upsert: true });
  }

  async findByReporter(email: string): Promise<readonly ReportOutcome[]> {
    const docs = await this.collection.find({ reporterEmail: email }).sort({ decidedAt: -1 }).toArray();
    return docs.map(({ _id, ...rest }) => ({ id: _id, ...rest }));
  }
}

type FlagDocument = Omit<ReportAbuseFlag, 'reporterEmail'> & { _id: string };

export class MongoReportAbuseFlagRepository implements ReportAbuseFlagRepositoryPort {
  static readonly COLLECTION = 'report_abuse_flags';

  private readonly collection: Collection<FlagDocument>;

  constructor(db: Db, collectionName = MongoReportAbuseFlagRepository.COLLECTION) {
    this.collection = db.collection<FlagDocument>(collectionName);
  }

  async findByReporter(email: string): Promise<ReportAbuseFlag | null> {
    const doc = await this.collection.findOne({ _id: email });
    return doc ? { reporterEmail: doc._id, ...withoutId(doc) } : null;
  }

  async save(flag: ReportAbuseFlag): Promise<void> {
    const { reporterEmail, ...rest } = flag;
    await this.collection.replaceOne({ _id: reporterEmail }, rest, { upsert: true });
  }

  async findOpen(): Promise<readonly ReportAbuseFlag[]> {
    const docs = await this.collection.find({ status: 'open' }).toArray();
    return docs.map((doc) => ({ reporterEmail: doc._id, ...withoutId(doc) }));
  }
}

function withoutId(doc: FlagDocument): Omit<ReportAbuseFlag, 'reporterEmail'> {
  const { _id, ...rest } = doc;
  void _id;
  return rest;
}

/** Auditoria append-only de reportes (HU-34 criterios 5 y 6). */
export class MongoReportAuditLog implements ReportAuditPort {
  static readonly COLLECTION = 'report_audit';

  private readonly collection: Collection<ReportAuditEvent>;

  constructor(db: Db, collectionName = MongoReportAuditLog.COLLECTION) {
    this.collection = db.collection<ReportAuditEvent>(collectionName);
  }

  static async ensureIndexes(db: Db, collectionName = MongoReportAuditLog.COLLECTION): Promise<void> {
    await db.collection(collectionName).createIndex({ occurredAt: -1 }, { name: 'idx_occurred' });
    await db.collection(collectionName).createIndex({ caseId: 1, occurredAt: -1 }, { name: 'idx_case_occurred' });
  }

  async record(event: ReportAuditEvent): Promise<void> {
    await this.collection.insertOne({ ...event });
  }
}
