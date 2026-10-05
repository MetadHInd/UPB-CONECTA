import type { IngestionCursor } from '../../value-objects/IngestionCursor.js';

export interface IngestionCursorRepositoryPort {
  load(): Promise<IngestionCursor>;
  save(cursor: IngestionCursor): Promise<void>;
}
