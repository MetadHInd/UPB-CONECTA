import type { Collection, Db } from 'mongodb';
import { convocatoriaIdToString } from '../../../ingestion/domain/value-objects/ConvocatoriaId.js';
import type { DueDate } from '../../../ingestion/domain/value-objects/DueDate.js';
import type { ArchivableConvocatoria, ConvocatoriaSourcePort } from '../../domain/ports/out/ConvocatoriaArchivePorts.js';

interface ConsolidatedMessageDocument {
  _id: string;
  sender: string;
  subject: string;
  firstSentAt: Date;
  dueDate: DueDate;
}

/**
 * Lee `ingestion_consolidated_messages` de forma independiente y solo lectura,
 * igual que `MongoDueDateConvocatoriaSource` (`notifications`): el puerto de
 * `ingestion` no expone enumeracion y este contexto no debe modificarlo.
 */
export class MongoConsolidatedConvocatoriaSource implements ConvocatoriaSourcePort {
  private readonly collection: Collection<ConsolidatedMessageDocument>;

  constructor(db: Db, collectionName = 'ingestion_consolidated_messages') {
    this.collection = db.collection<ConsolidatedMessageDocument>(collectionName);
  }

  async findWithDueDate(): Promise<readonly ArchivableConvocatoria[]> {
    const docs = await this.collection.find({ 'dueDate.kind': 'con-fecha' }).toArray();
    return docs.map((doc) => ({
      convocatoriaId: convocatoriaIdToString({ sender: doc.sender, subject: doc.subject, firstSentAt: doc.firstSentAt }),
      dueAt: doc.dueDate.kind === 'con-fecha' ? doc.dueDate.date : null
    }));
  }
}
