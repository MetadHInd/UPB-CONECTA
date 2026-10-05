import type { AccountRoleRepositoryPort } from '../domain/ports/out/AccountRoleRepositoryPort.js';
import { AuthorizationAuditEventKind, type AuthorizationAuditLogPort } from '../domain/ports/out/AuthorizationAuditLogPort.js';
import { requiredRoleFor, type ProtectedOperationsCatalog } from '../domain/ports/out/ProtectedOperationsCatalogPort.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import { authorize, type AuthorizationDecision } from '../domain/services/AuthorizationPolicy.js';
import { Role } from '../domain/value-objects/Role.js';

export interface AuthorizeOperationCommand {
  readonly subject: string;
  /** Debe coincidir con `ProtectedOperationEntry.operation` en el catalogo. */
  readonly operation: string;
  /** Direccion IP u origen de la peticion (criterio 3). */
  readonly origin: string;
}

/**
 * Una operacion que no esta en el catalogo no tiene rol declarado: no hay
 * nada que decidir, es un error de quien programo el adaptador de entrada
 * (deberia invocar esto solo para operaciones catalogadas). Fallar aqui, en
 * vez de tratarla como "sin restriccion", evita que un catalogo desactualizado
 * abra silenciosamente una operacion que debia estar protegida.
 */
export class UnknownProtectedOperationError extends Error {
  constructor(operation: string) {
    super(`La operacion '${operation}' no tiene un rol declarado en el catalogo de operaciones protegidas.`);
    this.name = 'UnknownProtectedOperationError';
  }
}

export interface AuthorizeOperationDependencies {
  readonly catalog: ProtectedOperationsCatalog;
  readonly roleRepo: AccountRoleRepositoryPort;
  readonly auditLog: AuthorizationAuditLogPort;
  readonly clock: ClockPort;
}

/**
 * HU-46 (RF-76, RNF-14, RNF-18): punto de enganche que un adaptador de
 * entrada futuro llama antes de ejecutar una operacion administrativa —
 * mismo patron que `VerifyAccessToken` (HU-45): "no haber servidor HTTP no
 * impide implementar la historia". El dominio ya deja listo que rol requiere
 * cada operacion (`ProtectedOperationsCatalogPort`) y como se decide
 * (`AuthorizationPolicy`); a este caso de uso solo le falta que algo lo
 * invoque de verdad.
 */
export class AuthorizeOperation {
  constructor(private readonly deps: AuthorizeOperationDependencies) {}

  async execute(command: AuthorizeOperationCommand): Promise<AuthorizationDecision> {
    const requiredRole = requiredRoleFor(this.deps.catalog, command.operation);
    if (requiredRole === null) {
      throw new UnknownProtectedOperationError(command.operation);
    }

    const record = await this.deps.roleRepo.findBySubject(command.subject);
    const actualRole = record?.role ?? Role.STUDENT;
    const decision = authorize(actualRole, requiredRole);

    if (!decision.allowed) {
      await this.deps.auditLog.record({
        kind: AuthorizationAuditEventKind.UNAUTHORIZED_ATTEMPT,
        subject: command.subject,
        operation: command.operation,
        origin: command.origin,
        requiredRole,
        actualRole,
        occurredAt: this.deps.clock.now()
      });
    }

    return decision;
  }
}
