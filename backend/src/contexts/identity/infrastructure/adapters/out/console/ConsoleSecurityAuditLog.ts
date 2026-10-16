import type { SecurityAuditEvent, SecurityAuditLogPort } from '../../../../domain/ports/out/SecurityAuditLogPort.js';

/**
 * Auditoria de seguridad (HU-45 criterio 6) hacia el log del proceso: en
 * Railway queda en los Deploy Logs sin crecer en memoria. Un destino
 * persistente (coleccion, SIEM) se puede enchufar despues en el mismo puerto.
 */
export class ConsoleSecurityAuditLog implements SecurityAuditLogPort {
  async record(event: SecurityAuditEvent): Promise<void> {
    console.warn('[security-audit]', JSON.stringify(event));
  }
}
