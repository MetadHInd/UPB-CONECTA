import type { Collection, Db } from 'mongodb';
import type { AutomaticModerationRecord, HumanModerationResolution } from '../../../../domain/entities/AutomaticModerationRecord.js';
import type { AutomaticModerationRecordPort } from '../../../../domain/ports/out/AutomaticModerationRecordPort.js';

type AutomaticModerationRecordDocument = Omit<AutomaticModerationRecord, 'recordId' | 'matchedTerms' | 'resolutions'> & {
  _id: string;
  matchedTerms: string[];
  resolutions: HumanModerationResolution[];
};

function toRecord(doc: AutomaticModerationRecordDocument): AutomaticModerationRecord {
  const { _id, ...rest } = doc;
  return { recordId: _id, ...rest };
}

/**
 * Decisiones de la moderación automática (HU-52 criterios 4 y 5). La parte
 * automática se escribe una sola vez (`insertOne`); una resolución humana
 * solo se agrega con `$push`, nunca con `$set`, así que la decisión original
 * no se puede sobrescribir desde este adaptador.
 */
export class MongoAutomaticModerationRecords implements AutomaticModerationRecordPort {
  static readonly COLLECTION = 'moderation_automatic_decisions';

  private readonly collection: Collection<AutomaticModerationRecordDocument>;

  constructor(db: Db, collectionName = MongoAutomaticModerationRecords.COLLECTION) {
    this.collection = db.collection<AutomaticModerationRecordDocument>(collectionName);
  }

  static async ensureIndexes(db: Db, collectionName = MongoAutomaticModerationRecords.COLLECTION): Promise<void> {
    await db.collection(collectionName).createIndex({ contentId: 1, decidedAt: 1 }, { name: 'idx_content_decided' });
  }

  async record(entry: AutomaticModerationRecord): Promise<void> {
    const { recordId, ...rest } = entry;
    await this.collection.insertOne({ _id: recordId, ...rest, matchedTerms: [...entry.matchedTerms], resolutions: [...entry.resolutions] });
  }

  async appendResolution(contentId: string, resolution: HumanModerationResolution): Promise<boolean> {
    const latest = await this.collection.findOne({ contentId }, { sort: { decidedAt: -1 }, projection: { _id: 1 } });
    if (latest === null) return false;
    await this.collection.updateOne({ _id: latest._id }, { $push: { resolutions: { ...resolution } } });
    return true;
  }

  async findByContentId(contentId: string): Promise<readonly AutomaticModerationRecord[]> {
    const docs = await this.collection.find({ contentId }).sort({ decidedAt: 1 }).toArray();
    return docs.map(toRecord);
  }
}
