import type { Collection, Db } from 'mongodb';
import type { AccountRoleRecord, AccountRoleRepositoryPort } from '../../../../domain/ports/out/AccountRoleRepositoryPort.js';

type AccountRoleDocument = AccountRoleRecord & { _id: string };

export class MongoAccountRoleRepository implements AccountRoleRepositoryPort {
  static readonly COLLECTION = 'identity_account_roles';

  private readonly collection: Collection<AccountRoleDocument>;

  constructor(db: Db, collectionName = MongoAccountRoleRepository.COLLECTION) {
    this.collection = db.collection<AccountRoleDocument>(collectionName);
  }

  async findBySubject(subject: string): Promise<AccountRoleRecord | null> {
    const found = await this.collection.findOne({ _id: subject });
    if (!found) return null;
    const { _id: _mongoId, ...record } = found;
    return record;
  }

  async save(record: AccountRoleRecord): Promise<void> {
    await this.collection.updateOne({ _id: record.subject }, { $set: { ...record, _id: record.subject } }, { upsert: true });
  }
}
