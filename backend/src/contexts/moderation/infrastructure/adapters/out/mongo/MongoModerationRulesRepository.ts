import type { Collection, Db } from 'mongodb';
import type { ModerationRulesRepositoryPort, StoredModerationRules } from '../../../../domain/ports/out/ModerationRulesRepositoryPort.js';
import type { ModerationRules } from '../../../../domain/value-objects/ModerationRules.js';
import { ModerationThresholds } from '../../../../domain/value-objects/ModerationThresholds.js';

interface ModerationRulesDocument {
  _id: 'current';
  lower: number;
  upper: number;
  bannedTerms: string[];
  updatedBy: string;
  updatedAt: Date;
}

/**
 * Reglas vigentes de la moderación (HU-52): un solo documento, leído en cada
 * evaluación. Sin documento rigen los valores iniciales de
 * `config/moderation-policy.json`. Los umbrales leídos se vuelven a validar,
 * para que un documento editado a mano no deje reglas incoherentes. Mismo
 * patrón que `MongoSanctionThresholdsRepository` (HU-35).
 */
export class MongoModerationRulesRepository implements ModerationRulesRepositoryPort {
  static readonly COLLECTION = 'moderation_rules';

  private readonly collection: Collection<ModerationRulesDocument>;

  constructor(
    db: Db,
    private readonly initial: ModerationRules,
    collectionName = MongoModerationRulesRepository.COLLECTION
  ) {
    this.collection = db.collection<ModerationRulesDocument>(collectionName);
  }

  async get(): Promise<StoredModerationRules> {
    const doc = await this.collection.findOne({ _id: 'current' });
    if (doc === null) return { rules: { thresholds: this.initial.thresholds, bannedTerms: [...this.initial.bannedTerms] }, updatedBy: null, updatedAt: null };
    return {
      rules: { thresholds: ModerationThresholds.of(doc.lower, doc.upper), bannedTerms: doc.bannedTerms },
      updatedBy: doc.updatedBy,
      updatedAt: doc.updatedAt
    };
  }

  async save(rules: ModerationRules, change: { readonly updatedBy: string; readonly updatedAt: Date }): Promise<void> {
    await this.collection.replaceOne(
      { _id: 'current' },
      { lower: rules.thresholds.lower, upper: rules.thresholds.upper, bannedTerms: [...rules.bannedTerms], ...change },
      { upsert: true }
    );
  }
}
