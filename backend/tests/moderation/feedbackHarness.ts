import { ApproveRetainedContent } from '../../src/contexts/moderation/application/ApproveRetainedContent.js';
import { EscalateOverdueRetainedContent } from '../../src/contexts/moderation/application/EscalateOverdueRetainedContent.js';
import { GetRetainedContentQueue } from '../../src/contexts/moderation/application/GetRetainedContentQueue.js';
import { HandleModerationDecision } from '../../src/contexts/moderation/application/HandleModerationDecision.js';
import { RejectRetainedContent } from '../../src/contexts/moderation/application/RejectRetainedContent.js';
import {
  parseModerationFeedbackConfig,
  type ModerationFeedbackConfig
} from '../../src/contexts/moderation/domain/value-objects/ModerationFeedbackConfig.js';
import type { ModerationDecisionInput } from '../../src/contexts/moderation/domain/value-objects/ModerationDecisionInput.js';
import { InMemoryAuthorFeedbackNotices } from '../../src/contexts/moderation/infrastructure/adapters/out/memory/InMemoryAuthorFeedbackNotices.js';
import { InMemoryContentModerationLog } from '../../src/contexts/moderation/infrastructure/adapters/out/memory/InMemoryContentModerationLog.js';
import { InMemoryHeldContentPublisher } from '../../src/contexts/moderation/infrastructure/adapters/out/memory/InMemoryHeldContentPublisher.js';
import { InMemoryRetainedContentQueue } from '../../src/contexts/moderation/infrastructure/adapters/out/memory/InMemoryRetainedContentQueue.js';
import { FixedClock } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/SystemClock.js';

export const NOW = new Date('2026-09-26T12:00:00Z');
export const HOUR_MS = 3_600_000;

export const TEST_CONFIG: ModerationFeedbackConfig = parseModerationFeedbackConfig({
  resolutionDeadlineHours: 24,
  norms: [
    { category: 'harassment', code: 'NC-01', title: 'Respeto y no acoso', text: 'No se permite hostigar a otras personas.' },
    { category: 'spam', code: 'NC-05', title: 'Spam', text: 'No se permite el spam.' }
  ]
});

export function retainDecision(overrides: Partial<ModerationDecisionInput> = {}): ModerationDecisionInput {
  return {
    contentId: 'post-1',
    contentKind: 'post',
    authorEmail: 'ana@upb.edu.co',
    verdict: 'retain',
    category: 'harassment',
    fragment: 'eres un inutil',
    detectedBy: 'auto-moderation',
    ...overrides
  };
}

export function blockDecision(overrides: Partial<ModerationDecisionInput> = {}): ModerationDecisionInput {
  return retainDecision({ verdict: 'block', ...overrides });
}

export function buildFeedbackHarness(config: ModerationFeedbackConfig = TEST_CONFIG) {
  const clock = new FixedClock(NOW);
  const queue = new InMemoryRetainedContentQueue();
  const log = new InMemoryContentModerationLog();
  const notices = new InMemoryAuthorFeedbackNotices();
  const publisher = new InMemoryHeldContentPublisher();

  const handle = new HandleModerationDecision({ config, queue, log, notifications: notices, clock });
  const approve = new ApproveRetainedContent({ config, queue, log, notifications: notices, publisher, clock });
  const reject = new RejectRetainedContent({ config, queue, log, notifications: notices, clock });
  const getQueue = new GetRetainedContentQueue({ queue, clock });
  const escalate = new EscalateOverdueRetainedContent({ queue, alerts: notices, clock });

  return { clock, queue, log, notices, publisher, handle, approve, reject, getQueue, escalate };
}
