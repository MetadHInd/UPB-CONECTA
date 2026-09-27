import type { ContentModerationLogEntry, ContentModerationLogPort } from '../../../../domain/ports/out/ContentModerationLogPort.js';

export class InMemoryContentModerationLog implements ContentModerationLogPort {
  readonly entries: ContentModerationLogEntry[] = [];

  async record(entry: ContentModerationLogEntry): Promise<void> {
    this.entries.push(structuredClone(entry));
  }

  async findByContentId(contentId: string): Promise<readonly ContentModerationLogEntry[]> {
    return this.entries.filter((entry) => entry.contentId === contentId).map((entry) => structuredClone(entry));
  }
}
