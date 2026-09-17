import type { Collection, Db } from 'mongodb';
import type {
  ProgramTargetingRecord,
  ProgramTargetingRepositoryPort
} from '../../../../domain/ports/out/ProgramTargetingRepositoryPort.js';
import type { ProgramTargeting } from '../../../../domain/value-objects/ProgramTargeting.js';

interface ProgramTargetingDocument {
  readonly _id: string;
  readonly messageId: string;
  readonly kind: ProgramTargeting['kind'];
  readonly facultyId?: string;
  readonly programIds?: readonly string[];
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
        persistedAt: record.persistedAt
      };
    case 'faculty':
      return {
        _id: record.messageId,
        messageId: record.messageId,
        kind: 'faculty',
        facultyId: record.targeting.facultyId,
        persistedAt: record.persistedAt
      };
    case 'programs':
      return {
        _id: record.messageId,
        messageId: record.messageId,
        kind: 'programs',
        programIds: [...record.targeting.programIds],
        persistedAt: record.persistedAt
      };
  }
}

export class MongoProgramTargetingRepository implements ProgramTargetingRepositoryPort {
  static readonly COLLECTION = 'program_targeting';

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

    return {
      messageId: found.messageId,
      targeting: toTargeting(found),
      persistedAt: found.persistedAt
    };
  }
}
