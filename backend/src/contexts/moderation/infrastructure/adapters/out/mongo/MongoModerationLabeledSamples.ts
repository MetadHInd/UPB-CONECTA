import type { Collection, Db } from 'mongodb';
import type {
  ModerationLabeledSample,
  ModerationLabeledSampleRepositoryPort
} from '../../../../domain/ports/out/ModerationLabeledSampleRepositoryPort.js';

interface ModerationLabeledSampleDocument {
  _id: string;
  text: string;
  offensive: boolean;
}

/** Conjunto de prueba etiquetado de la moderación (HU-52 criterio 7). `_id = sampleId`. */
export class MongoModerationLabeledSamples implements ModerationLabeledSampleRepositoryPort {
  static readonly COLLECTION = 'moderation_labeled_samples';

  private readonly collection: Collection<ModerationLabeledSampleDocument>;

  constructor(db: Db, collectionName = MongoModerationLabeledSamples.COLLECTION) {
    this.collection = db.collection<ModerationLabeledSampleDocument>(collectionName);
  }

  async save(sample: ModerationLabeledSample): Promise<void> {
    await this.collection.replaceOne({ _id: sample.sampleId }, { text: sample.text, offensive: sample.offensive }, { upsert: true });
  }

  async findAll(): Promise<readonly ModerationLabeledSample[]> {
    const docs = await this.collection.find({}).sort({ _id: 1 }).toArray();
    return docs.map((doc) => ({ sampleId: doc._id, text: doc.text, offensive: doc.offensive }));
  }
}
