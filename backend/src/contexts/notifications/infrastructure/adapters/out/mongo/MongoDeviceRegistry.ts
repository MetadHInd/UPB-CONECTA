import type { Collection, Db } from 'mongodb';
import type {
  DeviceInvalidationReason,
  DeviceRegistration,
  DeviceRegistrationStatus
} from '../../../../domain/entities/DeviceRegistration.js';
import type { DeviceRegistryPort } from '../../../../domain/ports/out/DeviceRegistryPort.js';

interface DeviceDocument {
  _id: string;
  studentId: string;
  status: DeviceRegistrationStatus;
  registeredAt: Date;
  updatedAt: Date;
  invalidatedReason: DeviceInvalidationReason | null;
}

function toRecord(doc: DeviceDocument): DeviceRegistration {
  return {
    studentId: doc.studentId,
    deviceToken: doc._id,
    status: doc.status,
    registeredAt: doc.registeredAt,
    updatedAt: doc.updatedAt,
    invalidatedReason: doc.invalidatedReason
  };
}

/**
 * Registro de dispositivos (HU-18) sobre MongoDB. `_id = deviceToken`: el
 * upsert por `_id` es lo que garantiza "sin duplicar entradas" (criterio 1)
 * sin necesidad de una consulta previa.
 */
export class MongoDeviceRegistry implements DeviceRegistryPort {
  private readonly collection: Collection<DeviceDocument>;

  constructor(db: Db, collectionName = 'notification_devices') {
    this.collection = db.collection<DeviceDocument>(collectionName);
  }

  static async ensureIndexes(db: Db, collectionName = 'notification_devices'): Promise<void> {
    await db.collection(collectionName).createIndex({ studentId: 1, status: 1 }, { name: 'idx_student_status' });
  }

  async register(studentId: string, deviceToken: string, at: Date): Promise<void> {
    await this.collection.updateOne(
      { _id: deviceToken },
      {
        $set: { studentId, status: 'active', updatedAt: at, invalidatedReason: null },
        $setOnInsert: { registeredAt: at }
      },
      { upsert: true }
    );
  }

  async rotateToken(previousToken: string, newToken: string, at: Date): Promise<void> {
    const existing = await this.collection.findOne({ _id: previousToken });
    if (existing === null) return;
    await this.collection.deleteOne({ _id: previousToken });
    await this.collection.updateOne(
      { _id: newToken },
      {
        $set: { studentId: existing.studentId, status: 'active', updatedAt: at, invalidatedReason: null },
        $setOnInsert: { registeredAt: existing.registeredAt }
      },
      { upsert: true }
    );
  }

  async invalidate(deviceToken: string, reason: DeviceInvalidationReason, at: Date): Promise<void> {
    await this.collection.updateOne(
      { _id: deviceToken },
      { $set: { status: 'invalidated', updatedAt: at, invalidatedReason: reason } }
    );
  }

  async findByToken(deviceToken: string): Promise<DeviceRegistration | null> {
    const found = await this.collection.findOne({ _id: deviceToken });
    return found ? toRecord(found) : null;
  }

  async findActiveForStudent(studentId: string): Promise<readonly DeviceRegistration[]> {
    const found = await this.collection.find({ studentId, status: 'active' }).toArray();
    return found.map(toRecord);
  }
}
