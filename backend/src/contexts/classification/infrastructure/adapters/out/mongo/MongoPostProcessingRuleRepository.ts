import type { Collection, Db } from 'mongodb';
import type { PostProcessingRuleData } from '../../../../domain/rules/PostProcessingRuleData.js';
import type { PostProcessingRuleRepositoryPort } from '../../../../domain/ports/out/PostProcessingRuleRepositoryPort.js';

type PostProcessingRuleDocument = PostProcessingRuleData & { _id?: string };

function stripMongoId(doc: PostProcessingRuleDocument): PostProcessingRuleData {
  const { _id: _mongoId, ...rule } = doc;
  return rule;
}

export class MongoPostProcessingRuleRepository implements PostProcessingRuleRepositoryPort {
  static readonly COLLECTION = 'post_processing_rules';

  static async ensureIndexes(db: Db, collectionName = MongoPostProcessingRuleRepository.COLLECTION): Promise<void> {
    await db.collection(collectionName).createIndex({ active: 1, precedence: 1 }, { name: 'idx_active_precedence' });
  }

  private readonly collection: Collection<PostProcessingRuleDocument>;

  constructor(db: Db, collectionName = MongoPostProcessingRuleRepository.COLLECTION) {
    this.collection = db.collection<PostProcessingRuleDocument>(collectionName);
  }

  async findActiveRules(): Promise<readonly PostProcessingRuleData[]> {
    const docs = await this.collection.find({ active: true }).toArray();
    return docs.map(stripMongoId);
  }

  async findAll(): Promise<readonly PostProcessingRuleData[]> {
    const docs = await this.collection.find({}).toArray();
    return docs.map(stripMongoId);
  }

  async findById(id: string): Promise<PostProcessingRuleData | null> {
    const doc = await this.collection.findOne({ _id: id });
    return doc ? stripMongoId(doc) : null;
  }

  async save(rule: PostProcessingRuleData): Promise<void> {
    await this.collection.updateOne({ _id: rule.id }, { $set: { ...rule, _id: rule.id } }, { upsert: true });
  }

  async setActive(id: string, active: boolean): Promise<void> {
    await this.collection.updateOne({ _id: id }, { $set: { active } });
  }
}
