import { MongoClient, type Db } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ReportCaseStatus, newReportCase, restoreCase } from '../../../src/contexts/reports/domain/entities/ContentReportCase.js';
import { MongoPostRepository } from '../../../src/contexts/forum/infrastructure/adapters/out/mongo/MongoPostRepository.js';
import {
  MongoReportAbuseFlagRepository,
  MongoReportAuditLog,
  MongoReportCaseRepository,
  MongoReportOutcomeRepository
} from '../../../src/contexts/reports/infrastructure/adapters/out/mongo/MongoReports.js';
import { buildReportsHarness, reporter } from '../../reports/reportsHarness.js';
import { ReviewDecision } from '../../../src/contexts/reports/domain/entities/ContentReportCase.js';

const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
const DATABASE = process.env['MONGODB_TEST_DATABASE'] ?? 'upb_conecta_test';
const C = {
  cases: 'report_cases_test',
  outcomes: 'report_outcomes_test',
  flags: 'report_abuse_flags_test',
  audit: 'report_audit_test',
  posts: 'forum_posts_reports_test'
};
const T0 = new Date('2026-09-22T12:00:00Z');
const content = { kind: 'post', id: 'p-1', topicId: 'general', title: 'Título', text: 'Texto' } as const;

describe('Adaptadores Mongo de reportes de la comunidad — HU-34 (integración contra MongoDB real)', () => {
  let client: MongoClient;
  let db: Db;

  beforeAll(async () => {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DATABASE);
    await MongoReportCaseRepository.ensureIndexes(db, C.cases);
    await MongoReportOutcomeRepository.ensureIndexes(db, C.outcomes);
    await MongoReportAuditLog.ensureIndexes(db, C.audit);
  });

  beforeEach(async () => {
    for (const name of Object.values(C)) await db.collection(name).deleteMany({});
  });

  afterAll(async () => {
    for (const name of Object.values(C)) await db.collection(name).drop().catch(() => undefined);
    await client.close();
  });

  it('MongoReportCaseRepository: crea una sola vez, cuenta un reporte por usuario aunque lleguen simultáneos y lista los pendientes', async () => {
    const repo = new MongoReportCaseRepository(db, C.cases);
    const fresh = newReportCase({ content, authorEmail: 'ana@upb.edu.co', now: T0 });
    expect(await repo.create(fresh)).toBe(true);
    expect(await repo.create(fresh)).toBe(false);
    expect(await repo.findPendingReview()).toHaveLength(0);

    const report = { reporterEmail: reporter(1), causeId: 'spam', detail: null, reportedAt: T0 };
    const outcomes = await Promise.all([repo.addReport(fresh.id, report), repo.addReport(fresh.id, report)]);
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    expect((await repo.findById(fresh.id))?.reports).toEqual([report]);
    expect(await repo.findPendingReview()).toHaveLength(1);
    expect(await repo.addReport('post:otro', report)).toBe(false);
    expect(await repo.findById('post:otro')).toBeNull();

    const current = (await repo.findById(fresh.id))!;
    await repo.update(restoreCase(current, { decidedBy: 'admin', reason: 'ok', now: T0 }));
    expect(await repo.findPendingReview()).toHaveLength(0);
    expect((await repo.findById(fresh.id))?.status).toBe(ReportCaseStatus.OPEN);
  });

  it('MongoReportOutcomeRepository, MongoReportAbuseFlagRepository y MongoReportAuditLog persisten', async () => {
    const outcomes = new MongoReportOutcomeRepository(db, C.outcomes);
    const outcome = { id: 'post:p-1:1:r', reporterEmail: 'r@upb.edu.co', caseId: 'post:p-1', outcome: 'unfounded', decidedAt: T0 } as const;
    await outcomes.record(outcome);
    await outcomes.record(outcome);
    expect(await outcomes.findByReporter('r@upb.edu.co')).toEqual([outcome]);

    const flags = new MongoReportAbuseFlagRepository(db, C.flags);
    const flag = { reporterEmail: 'r@upb.edu.co', unfoundedCount: 3, windowDays: 90, caseIds: ['post:p-1'], flaggedAt: T0, updatedAt: T0, status: 'open' } as const;
    await flags.save(flag);
    await flags.save({ ...flag, unfoundedCount: 4 });
    expect(await flags.findByReporter('r@upb.edu.co')).toEqual({ ...flag, unfoundedCount: 4 });
    expect(await flags.findOpen()).toHaveLength(1);
    expect(await flags.findByReporter('nadie@upb.edu.co')).toBeNull();

    const audit = new MongoReportAuditLog(db, C.audit);
    await audit.record({ kind: 'report-review-decided', caseId: 'post:p-1', decision: 'restore', reason: 'ok', performedBy: 'admin', occurredAt: T0 });
    expect(await db.collection(C.audit).countDocuments()).toBe(1);
  });

  it('MongoPostRepository oculta y muestra una publicación, y el flujo completo funciona sobre Mongo', async () => {
    const posts = new MongoPostRepository(db, C.posts);
    const harness = buildReportsHarness({
      cases: new MongoReportCaseRepository(db, C.cases),
      outcomes: new MongoReportOutcomeRepository(db, C.outcomes),
      abuseFlags: new MongoReportAbuseFlagRepository(db, C.flags),
      audit: new MongoReportAuditLog(db, C.audit)
    });
    // El foro del harness usa memoria: se replica la publicación en Mongo para probar el adaptador de publicaciones.
    const postId = await harness.publishPost();
    const stored = (await harness.forum.posts.findById(postId))!;
    await posts.save(stored);

    await posts.setHidden(postId, T0);
    expect((await posts.findById(postId))?.hiddenAt).toEqual(T0);
    await posts.setHidden(postId, null);
    expect((await posts.findById(postId))?.hiddenAt ?? null).toBeNull();
    expect(await posts.findById('no-existe')).toBeNull();

    for (const n of [1, 2, 3]) await harness.report.execute({ reporterEmail: reporter(n), kind: 'post', contentId: postId, causeId: 'spam' });
    expect((await harness.queue.execute())[0]?.status).toBe(ReportCaseStatus.HIDDEN_PREVENTIVELY);
    const restored = await harness.review.execute({ kind: 'post', contentId: postId, decision: ReviewDecision.RESTORE, reason: 'ok', performedBy: 'admin' });
    expect(restored.ok).toBe(true);
    expect(await db.collection(C.audit).countDocuments()).toBe(2);
  });
});
