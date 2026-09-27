import type { OfficialChannel } from '../domain/value-objects/ChatbotConfig.js';
import type { AnchoredSource } from '../domain/value-objects/SourceReference.js';
import type { EscalationReason } from '../domain/ports/out/EscalationLogPort.js';

export type ChatbotAnswer =
  | { readonly kind: 'answered'; readonly text: string; readonly sources: readonly AnchoredSource[] }
  | { readonly kind: 'out-of-scope'; readonly topicId: string; readonly message: string; readonly institutionalApp: string }
  | {
      readonly kind: 'escalated';
      readonly reason: EscalationReason;
      readonly message: string;
      readonly officialChannel: OfficialChannel;
    }
  | { readonly kind: 'invalid-question' };
