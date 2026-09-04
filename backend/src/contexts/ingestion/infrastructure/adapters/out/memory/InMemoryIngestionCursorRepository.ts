import type { IngestionCursorRepositoryPort } from '../../../../domain/ports/out/IngestionCursorRepositoryPort.js';
import { IngestionCursor } from '../../../../domain/value-objects/IngestionCursor.js';

export class InMemoryIngestionCursorRepository implements IngestionCursorRepositoryPort {
  private cursor: IngestionCursor = IngestionCursor.initial();

  async load(): Promise<IngestionCursor> {
    return this.cursor;
  }

  async save(cursor: IngestionCursor): Promise<void> {
    this.cursor = cursor;
  }
}
