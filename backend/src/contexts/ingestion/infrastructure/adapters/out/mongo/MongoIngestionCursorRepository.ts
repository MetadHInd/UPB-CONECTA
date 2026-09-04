import type { Collection, Db } from 'mongodb';
import type { IngestionCursorRepositoryPort } from '../../../../domain/ports/out/IngestionCursorRepositoryPort.js';
import { IngestionCursor } from '../../../../domain/value-objects/IngestionCursor.js';

interface CursorDocument {
  _id: string;
  lastConfirmedUid: number;
  lastConfirmedAt: Date | null;
}

const CURSOR_ID = 'institutional-mailbox';

export class MongoIngestionCursorRepository implements IngestionCursorRepositoryPort {
  private readonly collection: Collection<CursorDocument>;

  constructor(db: Db, collectionName = 'ingestion_cursors') {
    this.collection = db.collection<CursorDocument>(collectionName);
  }

  async load(): Promise<IngestionCursor> {
    const document = await this.collection.findOne({ _id: CURSOR_ID });
    if (document === null) return IngestionCursor.initial();
    return IngestionCursor.restore(document.lastConfirmedUid, document.lastConfirmedAt);
  }

  async save(cursor: IngestionCursor): Promise<void> {
    await this.collection.updateOne(
      { _id: CURSOR_ID },
      { $set: { lastConfirmedUid: cursor.lastConfirmedUid, lastConfirmedAt: cursor.lastConfirmedAt } },
      { upsert: true }
    );
  }
}
