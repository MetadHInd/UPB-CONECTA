import type { Db, Collection } from 'mongodb';
import type { ConvocatoriaRepositoryPort, ConvocatoriaEntry } from '../../../../domain/ports/out/ConvocatoriaRepositoryPort.js';
import type { ConsolidatedMessageRecord } from '../../../../../ingestion/domain/ports/out/ConsolidatedMessageRegistryPort.js';
import { convocatoriaIdToString } from '../../../../../ingestion/domain/value-objects/ConvocatoriaId.js';

interface ConsolidatedDoc {
  _id: string;
  sender: string;
  subject: string;
  body: string;
  representativeMessageId?: string | null;
  firstSentAt: Date;
  lastSentAt: Date;
  resendCount: number;
  dueDate: unknown;
  applicationLink: string | null;
  withdrawnAt?: Date | null;
}

export class MongoConvocatoriaRepository implements ConvocatoriaRepositoryPort {
  private readonly collection: Collection<ConsolidatedDoc>;

  constructor(db: Db, collectionName = 'ingestion_consolidated_messages') {
    this.collection = db.collection(collectionName);
  }

  async findSegmentedFeed(_profile: any, options?: { limit?: number | undefined } | undefined) {
    const cursor = this.collection.find({}, { sort: { lastSentAt: -1 } });
    if (options?.limit) cursor.limit(options.limit);
    const docs = await cursor.toArray();
    return docs.map<ConvocatoriaEntry>((d) => ({ id: d._id, record: toRecord(d) }));
  }
}

function toRecord(d: ConsolidatedDoc): ConsolidatedMessageRecord {
  return {
    sender: d.sender,
    subject: d.subject,
    body: d.body,
    representativeMessageId: d.representativeMessageId ?? null,
    firstSentAt: d.firstSentAt,
    lastSentAt: d.lastSentAt,
    resendCount: d.resendCount,
    dueDate: d.dueDate as any,
    applicationLink: d.applicationLink,
    withdrawnAt: d.withdrawnAt ?? null
  };
}
