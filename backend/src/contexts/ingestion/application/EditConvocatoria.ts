import type { ConsolidatedMessageRecord, ConsolidatedMessageRegistryPort } from '../domain/ports/out/ConsolidatedMessageRegistryPort.js';
import type { DueDate } from '../domain/value-objects/DueDate.js';
import { convocatoriaIdToString } from '../domain/value-objects/ConvocatoriaId.js';
import { ConvocatoriaAuditEventKind, type ConvocatoriaAuditLogPort } from '../domain/ports/out/ConvocatoriaAuditLogPort.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import { ConvocatoriaAlreadyWithdrawnError, ConvocatoriaNotFoundError } from './WithdrawConvocatoria.js';
import type { ProgramTargeting } from '../../targeting/domain/value-objects/ProgramTargeting.js';
import type { ProgramTargetingRepositoryPort } from '../../targeting/domain/ports/out/ProgramTargetingRepositoryPort.js';

/**
 * Campos editables. El remitente, el asunto y la fecha del primer envio no
 * estan: forman `ConvocatoriaId`, la clave con que el registro, el feed, el
 * detalle y la personalizacion (HU-16) identifican la convocatoria.
 * Cambiarlos crearia otra convocatoria, no editaria esta.
 */
export interface ConvocatoriaChanges {
  readonly body?: string;
  readonly dueDate?: DueDate;
  readonly applicationLink?: string | null;
  readonly targeting?: ProgramTargeting;
}

export interface EditConvocatoriaCommand {
  /** `representativeMessageId`: la identidad que ya tiene quien publico (`PublishConvocatoria` la devuelve). */
  readonly messageId: string;
  readonly changes: ConvocatoriaChanges;
  /**
   * Campos que una extension de la convocatoria (la oferta de practica,
   * HU-24) cambio en su propio almacen. Se auditan junto con los de aqui:
   * la edicion del agregado queda en un solo registro.
   */
  readonly extensionChanges?: readonly string[];
  /** Para la auditoria (HU-24 criterio 5); el rol se verifica en el borde con `AuthorizeOperation` (HU-46). */
  readonly editedBy: string;
}

export interface EditConvocatoriaResult {
  /** Vacio si nada cambio: no se escribe ni se audita. */
  readonly changedFields: readonly string[];
}

export interface EditConvocatoriaDependencies {
  readonly consolidatedRegistry: ConsolidatedMessageRegistryPort;
  readonly programTargetingRepo: ProgramTargetingRepositoryPort;
  readonly auditLog: ConvocatoriaAuditLogPort;
  readonly clock: ClockPort;
}

/**
 * HU-24, criterio 5: editar una convocatoria publicada, escribiendo en los
 * mismos repositorios que `PublishConvocatoria` (HU-50). Es la unica ruta de
 * escritura de una edicion: el backoffice de practicas la invoca, no escribe
 * por su cuenta.
 *
 * Recalculo de avisos programados: no hace falta invalidar nada. El
 * planificador de vencimiento (`EmitDueDateReminders`, HU-19) relee en cada
 * ciclo la fecha de cierre y la segmentacion vigentes, y su registro de
 * idempotencia incluye la fecha de cierre en la clave. Al guardar aqui la
 * fecha o los programas nuevos, el siguiente ciclo ya avisa segun ellos.
 */
export class EditConvocatoria {
  constructor(private readonly deps: EditConvocatoriaDependencies) {}

  async execute(command: EditConvocatoriaCommand): Promise<EditConvocatoriaResult> {
    const record = await this.deps.consolidatedRegistry.findByRepresentativeMessageId(command.messageId);
    if (!record) throw new ConvocatoriaNotFoundError();
    // Editar lo retirado lo devolveria al planificador sin que nadie lo vea en el feed.
    if (record.withdrawnAt) throw new ConvocatoriaAlreadyWithdrawnError();

    const { changes } = command;
    const currentTargeting = await this.deps.programTargetingRepo.findByMessageId(command.messageId);
    const changedFields: string[] = [];
    let next: ConsolidatedMessageRecord = record;

    if (changes.body !== undefined && changes.body !== record.body) {
      next = { ...next, body: changes.body };
      changedFields.push('body');
    }
    if (changes.dueDate !== undefined && !sameDueDate(changes.dueDate, record.dueDate)) {
      next = { ...next, dueDate: changes.dueDate };
      changedFields.push('dueDate');
    }
    if (changes.applicationLink !== undefined && changes.applicationLink !== record.applicationLink) {
      next = { ...next, applicationLink: changes.applicationLink };
      changedFields.push('applicationLink');
    }
    const targetingChanged =
      changes.targeting !== undefined && JSON.stringify(changes.targeting) !== JSON.stringify(currentTargeting?.targeting ?? null);
    if (targetingChanged) changedFields.push('targeting');
    changedFields.push(...(command.extensionChanges ?? []));

    if (changedFields.length === 0) return { changedFields };

    const now = this.deps.clock.now();
    if (next !== record) await this.deps.consolidatedRegistry.save(next);
    if (targetingChanged) {
      await this.deps.programTargetingRepo.save({
        messageId: command.messageId,
        targeting: changes.targeting!,
        semesterRange: currentTargeting?.semesterRange ?? null,
        persistedAt: now
      });
    }

    await this.deps.auditLog.record({
      kind: ConvocatoriaAuditEventKind.EDITED,
      convocatoriaId: convocatoriaIdToString(record),
      messageId: command.messageId,
      actor: command.editedBy,
      occurredAt: now,
      changedFields
    });
    return { changedFields };
  }
}

function sameDueDate(a: DueDate, b: DueDate): boolean {
  if (a.kind === 'con-fecha' && b.kind === 'con-fecha') return a.date.getTime() === b.date.getTime();
  return JSON.stringify(a) === JSON.stringify(b);
}
