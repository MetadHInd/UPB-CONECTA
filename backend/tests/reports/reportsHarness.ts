import { GetAuthorContentStatus } from '../../src/contexts/reports/application/GetAuthorContentStatus.js';
import { GetReportAbuseFlags } from '../../src/contexts/reports/application/GetReportAbuseFlags.js';
import { GetReportQueue } from '../../src/contexts/reports/application/GetReportQueue.js';
import { ReportContent } from '../../src/contexts/reports/application/ReportContent.js';
import { ReviewReportedContent } from '../../src/contexts/reports/application/ReviewReportedContent.js';
import type { ReportCaseRepositoryPort } from '../../src/contexts/reports/domain/ports/out/ReportCaseRepositoryPort.js';
import type { ReportedContentPort } from '../../src/contexts/reports/domain/ports/out/ReportedContentPort.js';
import type { ReportAuditPort } from '../../src/contexts/reports/domain/ports/out/ReportAuditPort.js';
import type { ReportAbuseFlagRepositoryPort } from '../../src/contexts/reports/domain/ports/out/ReportAbuseFlagRepositoryPort.js';
import type { ReportOutcomeRepositoryPort } from '../../src/contexts/reports/domain/ports/out/ReportOutcomeRepositoryPort.js';
import { ReportPolicy, type ReportPolicyValues } from '../../src/contexts/reports/domain/value-objects/ReportPolicy.js';
import { loadReportPolicy } from '../../src/contexts/reports/infrastructure/config/JsonReportPolicyLoader.js';
import {
  InMemoryReportAbuseFlagRepository,
  InMemoryReportAuditLog,
  InMemoryReportCaseRepository,
  InMemoryReportOutcomeRepository
} from '../../src/contexts/reports/infrastructure/adapters/out/memory/InMemoryReports.js';
import { ForumInfractionRecorderAdapter, ForumReportedContentAdapter } from '../../src/contexts/reports/infrastructure/integration/ForumReportsAdapters.js';
import { buildForumHarness } from '../forum/forumHarness.js';

export const ADMIN = 'admin-contenido@upb.edu.co';
export const ANA = 'ana@upb.edu.co';
export const reporter = (n: number): string => `reportante${n}@upb.edu.co`;

export function policyWith(overrides: Partial<Omit<ReportPolicyValues, 'abuse'>> & { abuse?: Partial<ReportPolicyValues['abuse']> } = {}): ReportPolicy {
  const base = loadReportPolicy().values;
  return ReportPolicy.of({ ...base, ...overrides, abuse: { ...base.abuse, ...overrides.abuse } });
}

/** Foro (HU-30/35) + reportes (HU-34), con la politica real de `config/community-reports.json` salvo que se sobreescriba. */
export function buildReportsHarness(
  options: {
    readonly policy?: ReportPolicy;
    readonly cases?: ReportCaseRepositoryPort;
    readonly contents?: (base: ReportedContentPort) => ReportedContentPort;
    readonly outcomes?: ReportOutcomeRepositoryPort;
    readonly abuseFlags?: ReportAbuseFlagRepositoryPort;
    readonly audit?: ReportAuditPort;
  } = {}
) {
  const forum = buildForumHarness();
  const policy = options.policy ?? loadReportPolicy();
  const cases = options.cases ?? new InMemoryReportCaseRepository();
  const outcomes = options.outcomes ?? new InMemoryReportOutcomeRepository();
  const abuseFlags = options.abuseFlags ?? new InMemoryReportAbuseFlagRepository();
  const memoryAudit = new InMemoryReportAuditLog();
  const audit = options.audit ?? memoryAudit;
  const clock = { now: forum.now };
  const forumContents = new ForumReportedContentAdapter({ posts: forum.posts, clock });
  const contents = options.contents ? options.contents(forumContents) : forumContents;
  const infractions = new ForumInfractionRecorderAdapter(forum.recordInfraction);

  return {
    forum,
    policy,
    cases,
    outcomes,
    abuseFlags,
    audit: memoryAudit,
    report: new ReportContent({ cases, contents, audit, clock, policy }),
    review: new ReviewReportedContent({ cases, contents, infractions, outcomes, abuseFlags, audit, clock, policy }),
    queue: new GetReportQueue({ cases, policy }),
    abuseList: new GetReportAbuseFlags({ abuseFlags }),
    authorStatus: new GetAuthorContentStatus({ cases }),
    /** Ana publica en un tema abierto y devuelve el id de la publicacion. */
    async publishPost(n = 1): Promise<string> {
      await forum.seed.execute(forum.seedTopics);
      await forum.login('ana');
      const created = await forum.createPost.execute({ authorEmail: ANA, topicId: 'general', body: { title: `Título ${n}`, text: `Texto ${n}` } });
      if (!created.ok) throw new Error(created.message);
      return created.post.id;
    },
    async visiblePostIds(): Promise<string[]> {
      const listed = await forum.listPosts.execute({ viewerEmail: ANA, topicId: 'general' });
      if (!listed.ok) throw new Error(listed.message);
      return listed.posts.map((post) => post.id);
    }
  };
}

export type ReportsHarness = ReturnType<typeof buildReportsHarness>;
