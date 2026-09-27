import type { Collection, Db } from 'mongodb';
import type { KnowledgeEntry } from '../../../../domain/entities/KnowledgeEntry.js';
import type { KnowledgeEntryRepositoryPort } from '../../../../domain/ports/out/KnowledgeEntryRepositoryPort.js';

type KnowledgeEntryDocument = Omit<KnowledgeEntry, 'id'> & { _id: string };

function toEntry(doc: KnowledgeEntryDocument): KnowledgeEntry {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

/**
 * Coleccion `knowledge_entries`, un documento por entrada con su historial
 * embebido. Cada lectura del chatbot va a la base: no hay cache, por eso una
 * entrada nueva o retirada surte efecto sin redespliegue (HU-41 criterios 2 y 3).
 */
export class MongoKnowledgeEntryRepository implements KnowledgeEntryRepositoryPort {
  static readonly COLLECTION = 'knowledge_entries';

  private readonly collection: Collection<KnowledgeEntryDocument>;

  constructor(db: Db, collectionName = MongoKnowledgeEntryRepository.COLLECTION) {
    this.collection = db.collection<KnowledgeEntryDocument>(collectionName);
  }

  static async ensureIndexes(db: Db, collectionName = MongoKnowledgeEntryRepository.COLLECTION): Promise<void> {
    await db.collection(collectionName).createIndex({ withdrawnAt: 1, category: 1 }, { name: 'idx_withdrawn_category' });
  }

  async findById(id: string): Promise<KnowledgeEntry | null> {
    const doc = await this.collection.findOne({ _id: id });
    return doc ? toEntry(doc) : null;
  }

  async findAll(): Promise<readonly KnowledgeEntry[]> {
    return (await this.collection.find({}).toArray()).map(toEntry);
  }

  async findActive(): Promise<readonly KnowledgeEntry[]> {
    return (await this.collection.find({ withdrawnAt: null }).toArray()).map(toEntry);
  }

  async save(entry: KnowledgeEntry): Promise<void> {
    const { id, ...rest } = entry;
    await this.collection.replaceOne({ _id: id }, rest, { upsert: true });
  }
}
