import { MongoServerError, type Collection, type Db } from 'mongodb';
import type { Topic, TopicStatus } from '../../../../domain/entities/Topic.js';
import type { TopicRepositoryPort } from '../../../../domain/ports/out/TopicRepositoryPort.js';
import type { ProgramTargeting } from '../../../../../targeting/domain/value-objects/ProgramTargeting.js';

interface TopicDocument {
  _id: string;
  name: string;
  description: string;
  restriction: ProgramTargeting;
  status: TopicStatus;
  createdAt: Date;
  updatedAt: Date;
  updatedBy: string;
}

const DUPLICATE_KEY = 11000;

function toTopic(doc: TopicDocument): Topic {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

/**
 * Temas del foro sobre MongoDB (HU-30). `_id = id` del tema, asi que `create`
 * con `insertOne` es la operacion que garantiza "no duplicar" (y la que hace
 * idempotente la siembra) sin consulta previa.
 */
export class MongoTopicRepository implements TopicRepositoryPort {
  static readonly COLLECTION = 'forum_topics';

  private readonly collection: Collection<TopicDocument>;

  constructor(db: Db, collectionName = MongoTopicRepository.COLLECTION) {
    this.collection = db.collection<TopicDocument>(collectionName);
  }

  static async ensureIndexes(db: Db, collectionName = MongoTopicRepository.COLLECTION): Promise<void> {
    await db.collection(collectionName).createIndex({ status: 1, name: 1 }, { name: 'idx_status_name' });
  }

  async findById(id: string): Promise<Topic | null> {
    const doc = await this.collection.findOne({ _id: id });
    return doc ? toTopic(doc) : null;
  }

  async findAll(): Promise<readonly Topic[]> {
    return (await this.collection.find({}).sort({ name: 1 }).toArray()).map(toTopic);
  }

  async findActive(): Promise<readonly Topic[]> {
    return (await this.collection.find({ status: 'active' }).sort({ name: 1 }).toArray()).map(toTopic);
  }

  async create(topic: Topic): Promise<boolean> {
    const { id, ...rest } = topic;
    try {
      await this.collection.insertOne({ _id: id, ...rest });
      return true;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === DUPLICATE_KEY) return false;
      throw error;
    }
  }

  async update(topic: Topic): Promise<void> {
    const { id, ...rest } = topic;
    await this.collection.replaceOne({ _id: id }, rest);
  }
}
