import type { Collection, Db } from 'mongodb';
import type { NotificationPreferences, ThemePreference } from '../../../../domain/entities/NotificationPreferences.js';
import type { NotificationPreferencesRepositoryPort } from '../../../../domain/ports/out/NotificationPreferencesRepositoryPort.js';

interface PreferencesDocument {
  _id: string;
  categoryPreferences: Record<string, boolean>;
  leadTimeMinutes: number;
  theme: ThemePreference;
  updatedAt: Date;
}

function toRecord(doc: PreferencesDocument): NotificationPreferences {
  return {
    studentId: doc._id,
    categoryPreferences: doc.categoryPreferences,
    leadTimeMinutes: doc.leadTimeMinutes,
    theme: doc.theme,
    updatedAt: doc.updatedAt
  };
}

/**
 * Preferencias de notificacion (HU-38) sobre MongoDB. `_id = studentId`:
 * solo interesa el estado vigente (a diferencia de `consent`, que es
 * append-only), asi que un upsert por `_id` reemplaza el documento entero.
 */
export class MongoNotificationPreferencesRepository implements NotificationPreferencesRepositoryPort {
  private readonly collection: Collection<PreferencesDocument>;

  constructor(db: Db, collectionName = 'notification_preferences') {
    this.collection = db.collection<PreferencesDocument>(collectionName);
  }

  async findByStudent(studentId: string): Promise<NotificationPreferences | null> {
    const found = await this.collection.findOne({ _id: studentId });
    return found ? toRecord(found) : null;
  }

  async save(preferences: NotificationPreferences): Promise<void> {
    await this.collection.updateOne(
      { _id: preferences.studentId },
      {
        $set: {
          categoryPreferences: preferences.categoryPreferences,
          leadTimeMinutes: preferences.leadTimeMinutes,
          theme: preferences.theme,
          updatedAt: preferences.updatedAt
        }
      },
      { upsert: true }
    );
  }
}
