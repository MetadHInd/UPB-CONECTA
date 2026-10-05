import type { Role } from '../../value-objects/Role.js';

export enum AuthorizationAuditEventKind {
  UNAUTHORIZED_ATTEMPT = 'unauthorized-attempt',
  ROLE_CHANGED = 'role-changed'
}

/**
 * HU-46, criterios 3 y 6. Dos hechos distintos en un solo log de auditoria
 * (mismo estilo que `SecurityAuditEvent` de HU-45: una union discriminada
 * por `kind`, no dos puertos separados, porque ambos son "eventos de
 * autorizacion de una cuenta" que conviene poder consultar juntos).
 */
export type AuthorizationAuditEvent =
  | {
      readonly kind: AuthorizationAuditEventKind.UNAUTHORIZED_ATTEMPT;
      readonly subject: string;
      readonly operation: string;
      readonly origin: string;
      readonly requiredRole: Role;
      readonly actualRole: Role;
      readonly occurredAt: Date;
    }
  | {
      readonly kind: AuthorizationAuditEventKind.ROLE_CHANGED;
      readonly subject: string;
      readonly previousRole: Role | null;
      readonly newRole: Role;
      readonly changedBy: string;
      readonly occurredAt: Date;
    };

export interface AuthorizationAuditLogPort {
  record(event: AuthorizationAuditEvent): Promise<void>;
}
