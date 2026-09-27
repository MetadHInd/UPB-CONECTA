import type { RetainedContent } from '../../../../domain/entities/RetainedContent.js';
import type { HeldContentStorePort } from '../../../../domain/ports/out/HeldContentStorePort.js';

export class InMemoryHeldContentStore implements HeldContentStorePort {
  private readonly items = new Map<string, RetainedContent>();

  async enqueue(content: RetainedContent): Promise<void> {
    if (!this.items.has(content.id)) this.items.set(content.id, structuredClone(content));
  }

  async findPending(): Promise<readonly RetainedContent[]> {
    return [...this.items.values()].map((item) => structuredClone(item)).sort((a, b) => a.retainedAt.getTime() - b.retainedAt.getTime());
  }

  async findById(id: string): Promise<RetainedContent | null> {
    const found = this.items.get(id);
    return found === undefined ? null : structuredClone(found);
  }

  async remove(id: string): Promise<void> {
    this.items.delete(id);
  }
}
