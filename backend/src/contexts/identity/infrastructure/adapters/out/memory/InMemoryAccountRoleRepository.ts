import type { AccountRoleRecord, AccountRoleRepositoryPort } from '../../../../domain/ports/out/AccountRoleRepositoryPort.js';

export class InMemoryAccountRoleRepository implements AccountRoleRepositoryPort {
  private readonly roles = new Map<string, AccountRoleRecord>();

  async findBySubject(subject: string): Promise<AccountRoleRecord | null> {
    return this.roles.get(subject) ?? null;
  }

  async save(record: AccountRoleRecord): Promise<void> {
    this.roles.set(record.subject, record);
  }
}
