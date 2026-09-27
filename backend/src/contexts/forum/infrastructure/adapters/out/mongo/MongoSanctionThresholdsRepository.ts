import type { Collection, Db } from 'mongodb';
import { SanctionThresholds, type SanctionThresholdValues } from '../../../../domain/value-objects/SanctionThresholds.js';
import type {
  SanctionThresholdsRepositoryPort,
  StoredSanctionThresholds
} from '../../../../domain/ports/out/SanctionThresholdsRepositoryPort.js';

interface ThresholdsDocument {
  _id: 'current';
  values: SanctionThresholdValues;
  updatedBy: string;
  updatedAt: Date;
}

/**
 * Umbrales vigentes (HU-35 criterio 7): un solo documento, leido en cada
 * infraccion. Sin documento rigen los valores por defecto. Lo que se lee se
 * vuelve a validar con `SanctionThresholds.of`, para que un documento editado
 * a mano no deje umbrales incoherentes.
 */
export class MongoSanctionThresholdsRepository implements SanctionThresholdsRepositoryPort {
  static readonly COLLECTION = 'forum_sanction_thresholds';

  private readonly collection: Collection<ThresholdsDocument>;

  constructor(db: Db, collectionName = MongoSanctionThresholdsRepository.COLLECTION) {
    this.collection = db.collection<ThresholdsDocument>(collectionName);
  }

  async get(): Promise<StoredSanctionThresholds> {
    const doc = await this.collection.findOne({ _id: 'current' });
    if (doc === null) return { thresholds: SanctionThresholds.default(), updatedBy: null, updatedAt: null };
    return { thresholds: SanctionThresholds.of(doc.values), updatedBy: doc.updatedBy, updatedAt: doc.updatedAt };
  }

  async set(thresholds: SanctionThresholds, change: { readonly updatedBy: string; readonly updatedAt: Date }): Promise<void> {
    await this.collection.replaceOne({ _id: 'current' }, { values: { ...thresholds.values }, ...change }, { upsert: true });
  }
}
