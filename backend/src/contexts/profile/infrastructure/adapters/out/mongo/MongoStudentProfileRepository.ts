import { MongoServerError, type Collection, type Db } from 'mongodb';
import { StudentProfile, type SemesterSource } from '../../../../domain/entities/StudentProfile.js';
import type { StudentProfileRepositoryPort } from '../../../../domain/ports/out/StudentProfileRepositoryPort.js';
import { SemesterNumber, type SemesterBounds } from '../../../../domain/value-objects/SemesterNumber.js';

/**
 * Documento minimo del perfil (HU-37 criterio 6): el correo como clave y lo
 * que segmenta el feed. Ni nombre ni codigo estudiantil.
 */
interface StudentProfileDocument {
  _id: string;
  /** Id del catalogo institucional, o null si el programa del directorio no se reconocio. */
  programId: string | null;
  semester: number | null;
  semesterSource: SemesterSource;
  updatedAt: Date;
  version: number;
}

const DUPLICATE_KEY = 11000;

export class MongoStudentProfileRepository implements StudentProfileRepositoryPort {
  static readonly COLLECTION = 'student_profiles';

  private readonly collection: Collection<StudentProfileDocument>;

  /**
   * `bounds` se usa al leer: si el rango configurado se reduce, un semestre
   * guardado que quedo fuera se trata como desconocido en vez de romper.
   */
  constructor(
    db: Db,
    private readonly bounds: SemesterBounds,
    collectionName = MongoStudentProfileRepository.COLLECTION
  ) {
    this.collection = db.collection<StudentProfileDocument>(collectionName);
  }

  async findByEmail(email: string): Promise<StudentProfile | null> {
    const doc = await this.collection.findOne({ _id: email });
    if (doc === null) return null;
    return StudentProfile.restore({
      email: doc._id,
      programId: doc.programId,
      semester: doc.semester === null ? null : SemesterNumber.fromDirectory(doc.semester, this.bounds),
      semesterSource: doc.semesterSource,
      updatedAt: doc.updatedAt,
      version: doc.version
    });
  }

  async save(profile: StudentProfile): Promise<boolean> {
    const fields = {
      programId: profile.directory.programId,
      semester: profile.semester?.value ?? null,
      semesterSource: profile.semesterSource,
      updatedAt: profile.updatedAt,
      version: profile.version + 1
    };

    if (profile.version === 0) {
      try {
        await this.collection.insertOne({ _id: profile.directory.email, ...fields });
        return true;
      } catch (error) {
        if (error instanceof MongoServerError && error.code === DUPLICATE_KEY) return false;
        throw error;
      }
    }

    const result = await this.collection.updateOne(
      { _id: profile.directory.email, version: profile.version },
      { $set: fields }
    );
    return result.modifiedCount === 1;
  }
}
