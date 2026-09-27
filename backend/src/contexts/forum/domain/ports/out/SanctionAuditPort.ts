import type { SanctionLevel } from '../../entities/Sanction.js';
import type { SanctionThresholdValues } from '../../value-objects/SanctionThresholds.js';

export type SanctionAuditEvent =
  | {
      readonly kind: 'sanction-imposed';
      readonly sanctionId: string;
      readonly studentEmail: string;
      readonly level: SanctionLevel;
      readonly triggeredByInfractionId: string;
      /** Lo impone el sistema por umbral, no una persona. */
      readonly performedBy: 'system';
      readonly occurredAt: Date;
    }
  | {
      readonly kind: 'sanction-revoked';
      readonly sanctionId: string;
      readonly studentEmail: string;
      readonly reason: string;
      /** Administrador que la revoco (criterio 6). */
      readonly performedBy: string;
      readonly occurredAt: Date;
    }
  | {
      readonly kind: 'thresholds-changed';
      readonly previous: SanctionThresholdValues;
      readonly next: SanctionThresholdValues;
      readonly performedBy: string;
      readonly occurredAt: Date;
    };

/**
 * Auditoria append-only de las decisiones sobre sanciones (HU-35 criterios 6
 * y 7). Puerto propio y no `ForumAccessAuditPort`: aquel registra accesos
 * denegados a temas, un hecho de otra naturaleza.
 */
export interface SanctionAuditPort {
  record(event: SanctionAuditEvent): Promise<void>;
}
