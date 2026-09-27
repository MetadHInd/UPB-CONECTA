import {
  InvalidSanctionThresholdsError,
  SanctionThresholds,
  type SanctionThresholdValues
} from '../domain/value-objects/SanctionThresholds.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { SanctionAuditPort } from '../domain/ports/out/SanctionAuditPort.js';
import type { SanctionThresholdsRepositoryPort, StoredSanctionThresholds } from '../domain/ports/out/SanctionThresholdsRepositoryPort.js';

export type UpdateSanctionThresholdsResult =
  | { readonly ok: true; readonly thresholds: SanctionThresholdValues }
  | { readonly ok: false; readonly error: 'invalid-thresholds'; readonly message: string };

/**
 * Ajuste de umbrales por el administrador (HU-35 criterio 7): es un dato, no
 * codigo, y `RecordInfraction` lo lee en cada infraccion. El cambio aplica
 * desde la siguiente infraccion; no reevalua sanciones ya impuestas, que se
 * sustentaron con los umbrales vigentes cuando se impusieron. Operacion de
 * administrador de contenido, declarada en `config/protected-operations.json`.
 */
export class ManageSanctionThresholds {
  constructor(
    private readonly dependencies: {
      readonly thresholds: SanctionThresholdsRepositoryPort;
      readonly audit: SanctionAuditPort;
      readonly clock: ClockPort;
    }
  ) {}

  async get(): Promise<StoredSanctionThresholds> {
    return this.dependencies.thresholds.get();
  }

  async update(input: { readonly values: Partial<SanctionThresholdValues>; readonly performedBy: string }): Promise<UpdateSanctionThresholdsResult> {
    const { thresholds, audit, clock } = this.dependencies;
    const previous = (await thresholds.get()).thresholds.values;

    let next: SanctionThresholds;
    try {
      next = SanctionThresholds.of({ ...previous, ...input.values });
    } catch (error) {
      if (error instanceof InvalidSanctionThresholdsError) return { ok: false, error: 'invalid-thresholds', message: error.message };
      throw error;
    }

    const now = clock.now();
    await thresholds.set(next, { updatedBy: input.performedBy, updatedAt: now });
    await audit.record({ kind: 'thresholds-changed', previous, next: next.values, performedBy: input.performedBy, occurredAt: now });
    return { ok: true, thresholds: next.values };
  }
}
