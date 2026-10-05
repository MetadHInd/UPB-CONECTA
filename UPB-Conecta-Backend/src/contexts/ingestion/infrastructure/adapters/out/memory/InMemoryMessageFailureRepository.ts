import type { MessageFailureRepositoryPort } from '../../../../domain/ports/out/MessageFailureRepositoryPort.js';

export class InMemoryMessageFailureRepository implements MessageFailureRepositoryPort {
  private readonly attempts = new Map<number, number>();

  async recordFailure(mailboxUid: number, _cause: string, _at: Date): Promise<number> {
    const total = (this.attempts.get(mailboxUid) ?? 0) + 1;
    this.attempts.set(mailboxUid, total);
    return total;
  }
}
