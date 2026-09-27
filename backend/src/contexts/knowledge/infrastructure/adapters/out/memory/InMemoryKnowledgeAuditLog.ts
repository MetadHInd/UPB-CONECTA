import type { KnowledgeAuditEvent, KnowledgeAuditLogPort } from '../../../../domain/ports/out/KnowledgeAuditLogPort.js';

export class InMemoryKnowledgeAuditLog implements KnowledgeAuditLogPort {
  readonly events: KnowledgeAuditEvent[] = [];

  async record(event: KnowledgeAuditEvent): Promise<void> {
    this.events.push(event);
  }

  async findByEntryId(entryId: string): Promise<readonly KnowledgeAuditEvent[]> {
    return this.events.filter((event) => event.entryId === entryId);
  }
}
