import type { SanctionAuditEvent, SanctionAuditPort } from '../../../../domain/ports/out/SanctionAuditPort.js';

export class InMemorySanctionAuditLog implements SanctionAuditPort {
  private readonly recorded: SanctionAuditEvent[] = [];

  get events(): readonly SanctionAuditEvent[] {
    return this.recorded;
  }

  /**
   * HU-48 criterio 5: el registro es append-only para el dominio; la unica
   * reescritura es la disociacion, que reemplaza al titular por un seudonimo.
   */
  dissociateStudent(email: string, pseudonym: string): number {
    let changed = 0;
    this.recorded.forEach((event, index) => {
      if ('studentEmail' in event && event.studentEmail === email) {
        this.recorded[index] = { ...event, studentEmail: pseudonym };
        changed += 1;
      }
    });
    return changed;
  }

  async record(event: SanctionAuditEvent): Promise<void> {
    this.recorded.push(event);
  }
}
