import type { RectificationEntry } from '../../../../domain/entities/RectificationEntry.js';
import type { RectificationLogPort } from '../../../../domain/ports/out/RectificationLogPort.js';

export class InMemoryRectificationLog implements RectificationLogPort {
  private entries: RectificationEntry[] = [];

  async record(entry: RectificationEntry): Promise<void> {
    this.entries.push(entry);
  }

  async findBySubject(subject: string): Promise<readonly RectificationEntry[]> {
    return this.entries.filter((e) => e.subject === subject).sort((a, b) => b.rectifiedAt.getTime() - a.rectifiedAt.getTime());
  }

  async deleteBySubject(subject: string): Promise<number> {
    const before = this.entries.length;
    this.entries = this.entries.filter((e) => e.subject !== subject);
    return before - this.entries.length;
  }
}
