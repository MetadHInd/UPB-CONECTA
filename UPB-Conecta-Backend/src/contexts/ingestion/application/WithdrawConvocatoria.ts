import type { ConsolidatedMessageRegistryPort } from '../domain/ports/out/ConsolidatedMessageRegistryPort.js';
import { convocatoriaIdToString, type ConvocatoriaId } from '../domain/value-objects/ConvocatoriaId.js';
import { ConvocatoriaAuditEventKind, type ConvocatoriaAuditLogPort } from '../domain/ports/out/ConvocatoriaAuditLogPort.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { NotificationSchedulingPort } from '../../classification/domain/ports/out/NotificationSchedulingPort.js';

export interface WithdrawConvocatoriaCommand {
  readonly convocatoriaId: ConvocatoriaId;
  /** Para la auditoria (criterio 6). */
  readonly withdrawnBy: string;
}

export class ConvocatoriaNotFoundError extends Error {
  constructor() {
    super('No existe una convocatoria consolidada con ese identificador.');
    this.name = 'ConvocatoriaNotFoundError';
  }
}

/** Retirar dos veces la misma convocatoria no es un no-op silencioso: quien lo intenta debe saber que ya no hay nada que retirar. */
export class ConvocatoriaAlreadyWithdrawnError extends Error {
  constructor() {
    super('Esta convocatoria ya fue retirada.');
    this.name = 'ConvocatoriaAlreadyWithdrawnError';
  }
}

export interface WithdrawConvocatoriaDependencies {
  readonly consolidatedRegistry: ConsolidatedMessageRegistryPort;
  readonly auditLog: ConvocatoriaAuditLogPort;
  readonly notificationSchedulingPort?: NotificationSchedulingPort;
  readonly clock: ClockPort;
}

/**
 * HU-50, criterios 3, 4 y 6: retira del feed una convocatoria visible.
 *
 * No se borra el documento (mismo principio que la cuarentena de HU-04): se
 * marca `withdrawnAt`, y el resto del sistema decide que hacer con eso — el
 * feed la excluye (`GetSegmentedFeed`), el detalle informa el retiro en vez
 * de mostrar contenido roto (`GetConvocatoriaDetail`, criterio 5).
 */
export class WithdrawConvocatoria {
  constructor(private readonly deps: WithdrawConvocatoriaDependencies) {}

  async execute(command: WithdrawConvocatoriaCommand): Promise<void> {
    const record = await this.deps.consolidatedRegistry.findById(command.convocatoriaId);
    if (!record) {
      throw new ConvocatoriaNotFoundError();
    }
    if (record.withdrawnAt !== null) {
      throw new ConvocatoriaAlreadyWithdrawnError();
    }

    const now = this.deps.clock.now();
    await this.deps.consolidatedRegistry.save({ ...record, withdrawnAt: now });

    // Criterio 4: cancela los avisos programados pendientes de esta convocatoria.
    if (record.representativeMessageId) {
      await this.deps.notificationSchedulingPort?.cancelScheduledNotifications(record.representativeMessageId);
    }

    await this.deps.auditLog.record({
      kind: ConvocatoriaAuditEventKind.WITHDRAWN,
      convocatoriaId: convocatoriaIdToString(command.convocatoriaId),
      messageId: record.representativeMessageId ?? '(sin mensaje representativo)',
      actor: command.withdrawnBy,
      occurredAt: now
    });
  }
}
