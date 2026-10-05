import type { Role } from '../../value-objects/Role.js';

/**
 * HU-46, criterio 6: rol vigente de una cuenta. `subject` es el mismo
 * identificador que ya usan `SessionTokenIssuer`/`SessionPrincipal` (HU-45),
 * no un id nuevo.
 */
export interface AccountRoleRecord {
  readonly subject: string;
  readonly role: Role;
  readonly assignedAt: Date;
  readonly assignedBy: string;
}

export interface AccountRoleRepositoryPort {
  /**
   * Sin registro, la cuenta es `Role.STUDENT` por defecto (criterio 4: toda
   * cuenta nueva es estudiante hasta que alguien la promueva explicitamente
   * — nunca administrador por omision).
   */
  findBySubject(subject: string): Promise<AccountRoleRecord | null>;
  /** Upsert por `subject`: un cambio de rol reemplaza el anterior, nunca acumula (criterio 6, "surte efecto en la siguiente peticion"). */
  save(record: AccountRoleRecord): Promise<void>;
}
