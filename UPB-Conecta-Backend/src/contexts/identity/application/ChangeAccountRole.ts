import type { AccountRoleRepositoryPort } from '../domain/ports/out/AccountRoleRepositoryPort.js';
import { AuthorizationAuditEventKind, type AuthorizationAuditLogPort } from '../domain/ports/out/AuthorizationAuditLogPort.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import { Role } from '../domain/value-objects/Role.js';

export interface ChangeAccountRoleCommand {
  readonly subject: string;
  readonly newRole: Role;
  /** Quien aplico el cambio (otro administrador) — obligatorio para la auditoria (criterio 6). */
  readonly changedBy: string;
}

/**
 * HU-46, criterio 6: cambiar el rol de una cuenta y auditar el cambio. No
 * hace falta invalidar ninguna sesion: `AuthorizeOperation` lee el rol
 * fresco de `AccountRoleRepositoryPort` en cada llamada (nunca lo cachea, ni
 * el token de sesion lo transporta), asi que "surte efecto en la siguiente
 * peticion" ya se cumple por diseno, sin ningun mecanismo adicional.
 */
export class ChangeAccountRole {
  constructor(
    private readonly deps: {
      readonly roleRepo: AccountRoleRepositoryPort;
      readonly auditLog: AuthorizationAuditLogPort;
      readonly clock: ClockPort;
    }
  ) {}

  async execute(command: ChangeAccountRoleCommand): Promise<void> {
    const previous = await this.deps.roleRepo.findBySubject(command.subject);
    const now = this.deps.clock.now();

    await this.deps.roleRepo.save({
      subject: command.subject,
      role: command.newRole,
      assignedAt: now,
      assignedBy: command.changedBy
    });

    await this.deps.auditLog.record({
      kind: AuthorizationAuditEventKind.ROLE_CHANGED,
      subject: command.subject,
      previousRole: previous?.role ?? null,
      newRole: command.newRole,
      changedBy: command.changedBy,
      occurredAt: now
    });
  }
}
