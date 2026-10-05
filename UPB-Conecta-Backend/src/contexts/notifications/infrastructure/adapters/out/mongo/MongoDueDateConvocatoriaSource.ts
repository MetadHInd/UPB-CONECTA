import type { Collection, Db } from 'mongodb';
import type {
  DueDateConvocatoriaCandidate,
  DueDateConvocatoriaSourcePort
} from '../../../../domain/ports/out/DueDateConvocatoriaSourcePort.js';
import type { DueDate } from '../../../../../ingestion/domain/value-objects/DueDate.js';
import { convocatoriaIdToString } from '../../../../../ingestion/domain/value-objects/ConvocatoriaId.js';

interface ConsolidatedMessageDocument {
  _id: string;
  sender: string;
  subject: string;
  firstSentAt: Date;
  representativeMessageId?: string | null;
  dueDate: DueDate;
  withdrawnAt?: Date | null;
}

/**
 * Lee la misma coleccion que `MongoConsolidatedMessageRegistry`
 * (`ingestion_consolidated_messages`), de forma independiente y sin
 * modificar ningun archivo de `ingestion` — mismo patron que
 * `MongoConvocatoriaRepository` (`feed`) para el mismo problema (ese puerto
 * tampoco expone enumeracion). Solo lectura: este adaptador nunca escribe en
 * la coleccion.
 */
export class MongoDueDateConvocatoriaSource implements DueDateConvocatoriaSourcePort {
  private readonly collection: Collection<ConsolidatedMessageDocument>;

  constructor(db: Db, collectionName = 'ingestion_consolidated_messages') {
    this.collection = db.collection<ConsolidatedMessageDocument>(collectionName);
  }

  async findWithDueDate(): Promise<readonly DueDateConvocatoriaCandidate[]> {
    const docs = await this.collection.find({ 'dueDate.kind': 'con-fecha' }).toArray();
    return docs.map((doc) => ({
      convocatoriaId: convocatoriaIdToString({ sender: doc.sender, subject: doc.subject, firstSentAt: doc.firstSentAt }),
      representativeMessageId: doc.representativeMessageId ?? null,
      dueAt: doc.dueDate.kind === 'con-fecha' ? doc.dueDate.date : null,
      withdrawn: Boolean(doc.withdrawnAt)
    }));
  }
}
