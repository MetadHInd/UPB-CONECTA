import type { ProcessedMessageRegistryPort } from '../../../../domain/ports/out/ProcessedMessageRegistryPort.js';
import type { MessageId } from '../../../../domain/value-objects/MessageId.js';

export class InMemoryProcessedMessageRegistry implements ProcessedMessageRegistryPort {
  private readonly processed = new Map<string, { mailboxUid: number; processedAt: Date }>();

  async hasBeenProcessed(messageId: MessageId): Promise<boolean> {
    return this.processed.has(messageId.toString());
  }

  async markAsProcessed(messageId: MessageId, mailboxUid: number, processedAt: Date): Promise<void> {
    this.processed.set(messageId.toString(), { mailboxUid, processedAt });
  }

  get size(): number {
    return this.processed.size;
  }
}
