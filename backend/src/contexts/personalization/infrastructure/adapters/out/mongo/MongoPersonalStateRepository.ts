import type { Collection, Db } from 'mongodb';
import type { ConvocatoriaPersonalState } from '../../../../domain/entities/ConvocatoriaPersonalState.js';
import type { PersonalStateRepositoryPort } from '../../../../domain/ports/out/PersonalStateRepositoryPort.js';

interface PersonalStateDocument {
  _id: string;
  studentId: string;
  convocatoriaId: string;
  read: boolean;
  saved: boolean;
  archived: boolean;
  updatedAt: Date;
}

function documentId(studentId: string, convocatoriaId: string): string {
  return `${studentId}|${convocatoriaId}`;
}

function toRecord(doc: PersonalStateDocument): ConvocatoriaPersonalState {
  return {
    studentId: doc.studentId,
    convocatoriaId: doc.convocatoriaId,
    read: doc.read,
    saved: doc.saved,
    archived: doc.archived,
    updatedAt: doc.updatedAt
  };
}

/**
 * Estado personal estudiante-convocatoria (HU-16) sobre MongoDB. `_id =
 * studentId|convocatoriaId`: upsert directo por `_id`, sin necesidad de
 * consulta previa, y el indice por `studentId` acelera las vistas de
 * guardados/archivados (criterios 2 y 3) sin escanear toda la coleccion.
 */
export class MongoPersonalStateRepository implements PersonalStateRepositoryPort {
  private readonly collection: Collection<PersonalStateDocument>;

  constructor(db: Db, collectionName = 'personalization_states') {
    this.collection = db.collection<PersonalStateDocument>(collectionName);
  }

  static async ensureIndexes(db: Db, collectionName = 'personalization_states'): Promise<void> {
    await db.collection(collectionName).createIndex({ studentId: 1, saved: 1 }, { name: 'idx_student_saved' });
    await db.collection(collectionName).createIndex({ studentId: 1, archived: 1 }, { name: 'idx_student_archived' });
  }

  async findByStudentAndConvocatoria(studentId: string, convocatoriaId: string): Promise<ConvocatoriaPersonalState | null> {
    const found = await this.collection.findOne({ _id: documentId(studentId, convocatoriaId) });
    return found ? toRecord(found) : null;
  }

  async save(state: ConvocatoriaPersonalState): Promise<void> {
    await this.collection.updateOne(
      { _id: documentId(state.studentId, state.convocatoriaId) },
      {
        $set: {
          studentId: state.studentId,
          convocatoriaId: state.convocatoriaId,
          read: state.read,
          saved: state.saved,
          archived: state.archived,
          updatedAt: state.updatedAt
        }
      },
      { upsert: true }
    );
  }

  async findSavedByStudent(studentId: string): Promise<readonly ConvocatoriaPersonalState[]> {
    const found = await this.collection.find({ studentId, saved: true }).toArray();
    return found.map(toRecord);
  }

  async findArchivedByStudent(studentId: string): Promise<readonly ConvocatoriaPersonalState[]> {
    const found = await this.collection.find({ studentId, archived: true }).toArray();
    return found.map(toRecord);
  }
}
