import type { ForumAccessAuditPort, ForumAccessDeniedEvent } from '../../../../domain/ports/out/ForumAccessAuditPort.js';

export class InMemoryForumAccessAuditLog implements ForumAccessAuditPort {
  private readonly recorded: ForumAccessDeniedEvent[] = [];

  get events(): readonly ForumAccessDeniedEvent[] {
    return this.recorded;
  }

  async record(event: ForumAccessDeniedEvent): Promise<void> {
    this.recorded.push(event);
  }
}
