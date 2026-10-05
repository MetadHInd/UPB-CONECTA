import type { Db, Collection } from 'mongodb';
import type { ConvocatoriaRepositoryPort, ConvocatoriaEntry } from '../../../../domain/ports/out/ConvocatoriaRepositoryPort.js';
import type { StudentSegment } from '../../../../domain/value-objects/StudentSegment.js';
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
  static readonly DEFAULT_COLLECTION = 'ingestion_consolidated_messages';

  private readonly collection: Collection<ConsolidatedDoc>;

  constructor(db: Db, collectionName = MongoConvocatoriaRepository.DEFAULT_COLLECTION) {
    this.collection = db.collection(collectionName);
  }

  /**
   * HU-55, criterio 2: este archivo no tenia `ensureIndexes` propio (a
   * diferencia de `MongoClassificationResultRepository`, `MongoPostRepository`
   * o `MongoForumAccessAuditLog`), aunque `findSegmentedFeed` filtra por
   * `withdrawnAt` y ordena por `lastSentAt`. En produccion la coleccion por
   * defecto (`ingestion_consolidated_messages`) ya recibe `idx_last_sent_at`
   * de `MongoConsolidatedMessageRegistry.ensureIndexes` (mismo nombre de
   * coleccion, contexto `ingestion`), pero ese acoplamiento implicito no debe
   * ser la unica garantia: `feed` declara aqui el indice que su propia
   * consulta necesita, para que este archivo sea autosuficiente (por ejemplo,
   * en pruebas que usan una coleccion propia). `createIndex` es idempotente:
   * si el indice equivalente ya existe (por nombre o especificacion), no hace
   * nada.
   */
  static async ensureIndexes(db: Db, collectionName = MongoConvocatoriaRepository.DEFAULT_COLLECTION): Promise<void> {
    await db
      .collection(collectionName)
      .createIndex({ withdrawnAt: 1, lastSentAt: -1 }, { name: 'idx_withdrawn_lastsent' });
  }

  /**
   * HU-55, criterio 2 (correccion real, no solo indice): antes de esta
   * correccion, esta consulta ignoraba `profile` por completo y traia TODA la
   * coleccion sin filtrar (ni siquiera por `withdrawnAt`) contra 20k
   * documentos consolidados. El filtro por programa/facultad/semestre exige
   * resolver targeting (`program_targeting`) y, para eso, el catalogo de
   * facultades — logica de dominio que le pertenece a `GetSegmentedFeed`
   * (`FeedVisibilityPolicy`), no a este adaptador; empujarla aqui rompería la
   * arquitectura hexagonal. Lo que si es puramente de infraestructura, y por
   * eso se empuja a Mongo, es `withdrawnAt`: un booleano/fecha sin logica de
   * negocio que de todas formas se descarta despues (HU-50, criterio 3), asi
   * que filtrarlo aqui reduce el volumen que sale de la base sin cambiar el
   * resultado observable. `profile` se conserva en la firma del puerto (no se
   * usa aqui) porque forma parte del contrato con `GetSegmentedFeed`.
   */
  async findSegmentedFeed(_profile: StudentSegment, options?: { limit?: number | undefined } | undefined) {
    const cursor = this.collection.find({ withdrawnAt: null }, { sort: { lastSentAt: -1 } });
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
