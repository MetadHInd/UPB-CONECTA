import type { Collection, Db } from 'mongodb';
import type { PracticeModality, PracticeOfferDetails } from '../../../../domain/entities/PracticeOffer.js';
import type { PracticeOfferRepositoryPort } from '../../../../domain/ports/out/PracticeOfferRepositoryPort.js';

interface PracticeOfferDocument {
  _id: string;
  convocatoriaId: { sender: string; subject: string; firstSentAt: Date };
  company: string;
  requirements: string;
  modality: PracticeModality;
  createdBy: string;
  createdAt: Date;
  updatedBy: string;
  updatedAt: Date;
  withdrawnAt: Date | null;
}

function toOffer(doc: PracticeOfferDocument): PracticeOfferDetails {
  const { _id, ...rest } = doc;
  return { messageId: _id, ...rest };
}

/**
 * Detalle propio de las ofertas de practica (HU-24). `_id = messageId`: una
 * oferta por convocatoria. El indice por modalidad y retiro anticipa el
 * filtro por modalidad del listado de HU-22.
 */
export class MongoPracticeOfferRepository implements PracticeOfferRepositoryPort {
  static readonly COLLECTION = 'practice_offers';

  private readonly collection: Collection<PracticeOfferDocument>;

  constructor(db: Db, collectionName = MongoPracticeOfferRepository.COLLECTION) {
    this.collection = db.collection<PracticeOfferDocument>(collectionName);
  }

  static async ensureIndexes(db: Db, collectionName = MongoPracticeOfferRepository.COLLECTION): Promise<void> {
    await db.collection(collectionName).createIndex({ modality: 1, withdrawnAt: 1 }, { name: 'idx_modality_withdrawn' });
  }

  async findByMessageId(messageId: string): Promise<PracticeOfferDetails | null> {
    const doc = await this.collection.findOne({ _id: messageId });
    return doc ? toOffer(doc) : null;
  }

  async save(offer: PracticeOfferDetails): Promise<void> {
    const { messageId, ...rest } = offer;
    await this.collection.replaceOne({ _id: messageId }, rest, { upsert: true });
  }
}
