import type { Collection, Db } from 'mongodb';
import type {
  ProgramTargetingRecord,
  ProgramTargetingRepositoryPort
} from '../../../../domain/ports/out/ProgramTargetingRepositoryPort.js';
import type { ProgramTargeting } from '../../../../domain/value-objects/ProgramTargeting.js';
import type { SemesterRange } from '../../../../domain/value-objects/SemesterRange.js';

interface ProgramTargetingDocument {
  readonly _id: string;
  readonly messageId: string;
  readonly kind: ProgramTargeting['kind'];
  readonly facultyId?: string;
  readonly programIds?: readonly string[];
  readonly semesterRange?: SemesterRange | null;
  readonly persistedAt: Date;
}

function toTargeting(doc: ProgramTargetingDocument): ProgramTargeting {
  switch (doc.kind) {
    case 'all-community':
      return { kind: 'all-community' };
    case 'faculty':
      return { kind: 'faculty', facultyId: doc.facultyId ?? '' };
    case 'programs':
      return { kind: 'programs', programIds: doc.programIds ?? [] };
    default:
      return { kind: 'all-community' };
  }
}

function toDocument(record: ProgramTargetingRecord): ProgramTargetingDocument {
  switch (record.targeting.kind) {
    case 'all-community':
      return {
        _id: record.messageId,
        messageId: record.messageId,
        kind: 'all-community',
        semesterRange: record.semesterRange ?? null,
        persistedAt: record.persistedAt
      };
    case 'faculty':
      return {
        _id: record.messageId,
        messageId: record.messageId,
        kind: 'faculty',
        facultyId: record.targeting.facultyId,
        semesterRange: record.semesterRange ?? null,
        persistedAt: record.persistedAt
      };
    case 'programs':
      return {
        _id: record.messageId,
        messageId: record.messageId,
        kind: 'programs',
        programIds: [...record.targeting.programIds],
        semesterRange: record.semesterRange ?? null,
        persistedAt: record.persistedAt
      };
  }
}

export class MongoProgramTargetingRepository implements ProgramTargetingRepositoryPort {
  static readonly COLLECTION = 'program_targeting';

  static async ensureIndexes(db: Db, collectionName = MongoProgramTargetingRepository.COLLECTION): Promise<void> {
    await db.collection(collectionName).createIndex({ programIds: 1 }, { name: 'idx_program_ids' });
    await db.collection(collectionName).createIndex({ facultyId: 1 }, { name: 'idx_faculty_id' });
    await db.collection(collectionName).createIndex({ persistedAt: -1 }, { name: 'idx_persisted_at' });
  }

  private readonly collection: Collection<ProgramTargetingDocument>;

  constructor(db: Db, collectionName = MongoProgramTargetingRepository.COLLECTION) {
    this.collection = db.collection<ProgramTargetingDocument>(collectionName);
  }

  async save(record: ProgramTargetingRecord): Promise<void> {
    await this.collection.updateOne({ _id: record.messageId }, { $set: toDocument(record) }, { upsert: true });
  }

  async findByMessageId(messageId: string): Promise<ProgramTargetingRecord | null> {
    const found = await this.collection.findOne({ _id: messageId });
    if (!found) {
      return null;
    }

    const record: ProgramTargetingRecord = {
      messageId: found.messageId,
      targeting: toTargeting(found),
      persistedAt: found.persistedAt
    };
    // Registros anteriores a HU-37 no tienen el campo: se leen sin restriccion.
    return found.semesterRange ? { ...record, semesterRange: found.semesterRange } : record;
  }
}
