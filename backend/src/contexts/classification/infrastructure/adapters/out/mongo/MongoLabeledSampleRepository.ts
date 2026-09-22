import type { Collection, Db } from 'mongodb';
import type { LabeledSample, LabeledSampleRepositoryPort } from '../../../../domain/ports/out/LabeledSampleRepositoryPort.js';

type LabeledSampleDocument = LabeledSample & { _id?: string };

function stripMongoId(doc: LabeledSampleDocument): LabeledSample {
  const { _id: _mongoId, ...sample } = doc;
  return sample;
}

export class MongoLabeledSampleRepository implements LabeledSampleRepositoryPort {
  static readonly COLLECTION = 'classification_labeled_samples';

  private readonly collection: Collection<LabeledSampleDocument>;

  constructor(db: Db, collectionName = MongoLabeledSampleRepository.COLLECTION) {
    this.collection = db.collection<LabeledSampleDocument>(collectionName);
  }

  async save(sample: LabeledSample): Promise<void> {
    await this.collection.updateOne(
      { _id: sample.messageId },
      { $set: { ...sample, _id: sample.messageId } },
      { upsert: true }
    );
  }

  async findAll(): Promise<readonly LabeledSample[]> {
    const docs = await this.collection.find({}).toArray();
    return docs.map(stripMongoId);
  }
}
