import type { SecurityAuditEvent, SecurityAuditLogPort } from '../../../../domain/ports/out/SecurityAuditLogPort.js';

/**
 * Doble en memoria de la auditoria de seguridad (HU-45 criterio 6). Suficiente
 * para verificar que el intento queda registrado; el destino persistente
 * (coleccion, SIEM, log estructurado) se decide cuando exista la capa HTTP.
 */
export class InMemorySecurityAuditLog implements SecurityAuditLogPort {
  private readonly recorded: SecurityAuditEvent[] = [];

  get events(): readonly SecurityAuditEvent[] {
    return this.recorded;
  }

  async record(event: SecurityAuditEvent): Promise<void> {
    this.recorded.push(event);
  }
}
