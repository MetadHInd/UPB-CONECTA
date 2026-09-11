import type { QuarantinedMessage } from '../../../../domain/entities/QuarantinedMessage.js';
import type { QuarantineRepositoryPort } from '../../../../domain/ports/out/QuarantineRepositoryPort.js';

export class InMemoryQuarantineRepository implements QuarantineRepositoryPort {
  private readonly messages = new Map<number, QuarantinedMessage>();

  async save(message: QuarantinedMessage): Promise<void> {
    this.messages.set(message.mailboxUid, message);
  }

  async findByUid(mailboxUid: number): Promise<QuarantinedMessage | null> {
    return this.messages.get(mailboxUid) ?? null;
  }

  get size(): number {
    return this.messages.size;
  }
}
