import type { Collection, Db } from 'mongodb';
import type { EmittedReminderRegistryPort } from '../../../../domain/ports/out/EmittedReminderRegistryPort.js';

interface EmittedReminderDocument {
  _id: string;
  studentId: string;
  convocatoriaId: string;
  thresholdMinutes: number;
  dueAtEpochMs: number;
  emittedAt: Date;
}

function documentId(studentId: string, convocatoriaId: string, thresholdMinutes: number, dueAtEpochMs: number): string {
  return `${studentId}|${convocatoriaId}|${thresholdMinutes}|${dueAtEpochMs}`;
}

/** Registro de idempotencia de HU-19 (ver `EmittedReminderRegistryPort`) sobre MongoDB. */
export class MongoEmittedReminderRegistry implements EmittedReminderRegistryPort {
  private readonly collection: Collection<EmittedReminderDocument>;

  constructor(db: Db, collectionName = 'notifications_emitted_reminders') {
    this.collection = db.collection<EmittedReminderDocument>(collectionName);
  }

  static async ensureIndexes(db: Db, collectionName = 'notifications_emitted_reminders'): Promise<void> {
    await db.collection(collectionName).createIndex({ studentId: 1, convocatoriaId: 1 }, { name: 'idx_student_convocatoria' });
  }

  async wasEmitted(studentId: string, convocatoriaId: string, thresholdMinutes: number, dueAtEpochMs: number): Promise<boolean> {
    const doc = await this.collection.findOne({ _id: documentId(studentId, convocatoriaId, thresholdMinutes, dueAtEpochMs) });
    return doc !== null;
  }

  async markEmitted(
    studentId: string,
    convocatoriaId: string,
    thresholdMinutes: number,
    dueAtEpochMs: number,
    at: Date
  ): Promise<void> {
    const _id = documentId(studentId, convocatoriaId, thresholdMinutes, dueAtEpochMs);
    await this.collection.updateOne(
      { _id },
      { $set: { _id, studentId, convocatoriaId, thresholdMinutes, dueAtEpochMs, emittedAt: at } },
      { upsert: true }
    );
  }
}
