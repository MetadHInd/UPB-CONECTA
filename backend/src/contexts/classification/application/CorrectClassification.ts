import type { ConvocatoriaId } from '../../ingestion/domain/value-objects/ConvocatoriaId.js';
import type { ConsolidatedMessageRegistryPort } from '../../ingestion/domain/ports/out/ConsolidatedMessageRegistryPort.js';
import type { DueDate } from '../../ingestion/domain/value-objects/DueDate.js';
import type { ProgramTargeting } from '../../targeting/domain/value-objects/ProgramTargeting.js';
import type { ProgramTargetingRepositoryPort } from '../../targeting/domain/ports/out/ProgramTargetingRepositoryPort.js';
import type { ClassificationResultRecord } from '../domain/entities/ClassificationResult.js';
import type { ClassificationResultRepositoryPort } from '../domain/ports/out/ClassificationResultRepositoryPort.js';
import type { ClassificationCorrectionRepositoryPort } from '../domain/ports/out/ClassificationCorrectionRepositoryPort.js';
import type { LabeledSampleRepositoryPort } from '../domain/ports/out/LabeledSampleRepositoryPort.js';
import type { NotificationSchedulingPort } from '../domain/ports/out/NotificationSchedulingPort.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { MessageCategory } from '../domain/value-objects/MessageCategory.js';

export interface CorrectClassificationCommand {
  readonly convocatoriaId: ConvocatoriaId;
  readonly correctedCategory: MessageCategory;
  readonly correctedTargeting: ProgramTargeting;
  readonly correctedDueDate: DueDate;
}

/**
 * HU-11, criterio 1: no hay nada que corregir si el documento nunca paso por
 * el clasificador (por ejemplo, sigue en cuarentena o en la cola de
 * reintento sin resultado). El administrador corrige una clasificacion
 * existente, no crea una desde cero.
 */
export class DocumentNotClassifiedError extends Error {
  constructor(messageId: string) {
    super(`El mensaje ${messageId} no tiene un resultado de clasificacion para corregir.`);
    this.name = 'DocumentNotClassifiedError';
  }
}

export class ConvocatoriaNotFoundError extends Error {
  constructor() {
    super('No existe una convocatoria consolidada con ese identificador.');
    this.name = 'ConvocatoriaNotFoundError';
  }
}

export interface CorrectClassificationDependencies {
  /** ingestion: para leer y actualizar la fecha de cierre del grupo consolidado. */
  readonly consolidatedRegistry: ConsolidatedMessageRegistryPort;
  readonly classificationResultRepo: ClassificationResultRepositoryPort;
  /** HU-10: la correccion humana se registra como caso etiquetado (criterio 2). */
  readonly labeledSampleRepo: LabeledSampleRepositoryPort;
  /** HU-11, criterio 5: historico append-only de correcciones. */
  readonly correctionRepo: ClassificationCorrectionRepositoryPort;
  /** targeting: para actualizar los programas destinatarios. */
  readonly programTargetingRepo: ProgramTargetingRepositoryPort;
  /**
   * Opcional, igual que en `ClassifyInstitutionalMessage`: sin este puerto la
   * correccion se persiste igual, solo no dispara el aviso.
   */
  readonly notificationSchedulingPort?: NotificationSchedulingPort;
  readonly clock: ClockPort;
}

/**
 * HU-11 (RF-16, RF-75): correccion manual de categoria, programas
 * destinatarios y fecha de cierre de un documento ya clasificado, con
 * realimentacion etiquetada para el corpus de HU-10.
 *
 * Decision — "corregir" es "aprobar": la historia no define una accion de
 * aprobacion separada de la correccion. Un administrador que corrige un
 * documento en revision pendiente esta, por definicion, vetandolo: no existe
 * un tercer estado "corregido pero todavia pendiente". Por eso esta
 * operacion siempre deja `publicationStatus: 'published'`, sea cual sea el
 * estado previo (cubre los criterios 3 y 4 con una unica regla, sin ramas
 * especiales).
 *
 * Decision — sin bus de eventos: el diseno de la historia en Jira habla de
 * un evento de dominio `ClassificationCorrected` que "recalcula segmentacion
 * y notificaciones". Ningun otro contexto de este repositorio usa un bus de
 * eventos; introducir uno para una sola historia romperia con el patron
 * establecido (casos de uso que llaman puertos directamente, ver
 * `ClassifyInstitutionalMessage`). El mismo efecto se logra aqui llamando
 * los puertos correspondientes en secuencia: la segmentacion no esta
 * materializada en ningun lado (el feed la lee en vivo desde
 * `ProgramTargetingRepositoryPort`, ver README de `feed`), asi que
 * "recalcularla" es exactamente volver a guardar el registro de targeting.
 */
export class CorrectClassification {
  constructor(private readonly deps: CorrectClassificationDependencies) {}

  async execute(command: CorrectClassificationCommand): Promise<ClassificationResultRecord> {
    const consolidated = await this.deps.consolidatedRegistry.findById(command.convocatoriaId);
    if (!consolidated) {
      throw new ConvocatoriaNotFoundError();
    }

    const messageId = consolidated.representativeMessageId;
    const existing = messageId ? await this.deps.classificationResultRepo.findByMessageId(messageId) : null;
    if (!messageId || !existing) {
      throw new DocumentNotClassifiedError(messageId ?? '(sin mensaje representativo)');
    }

    const correctedRecord: ClassificationResultRecord = {
      ...existing,
      finalCategory: command.correctedCategory,
      publicationStatus: 'published',
      reason: `Corregido manualmente por el administrador de contenido (propuesta original del modelo: ${existing.proposedCategory})`,
      persistedAt: this.deps.clock.now()
    };
    await this.deps.classificationResultRepo.save(correctedRecord);

    // Criterio 2: caso etiquetado (reutiliza el corpus de HU-10).
    await this.deps.labeledSampleRepo.save({ messageId, actualCategory: command.correctedCategory });

    // Criterio 5: historico de correcciones, independiente del corpus de HU-10.
    await this.deps.correctionRepo.save({
      messageId,
      proposedCategory: existing.proposedCategory,
      previousFinalCategory: existing.finalCategory,
      correctedCategory: command.correctedCategory,
      correctedAt: this.deps.clock.now()
    });

    // Criterios 1 y 4: programas destinatarios. Se preserva el semestre ya
    // configurado (HU-37): esta historia no pide tocarlo.
    const previousTargeting = await this.deps.programTargetingRepo.findByMessageId(messageId);
    await this.deps.programTargetingRepo.save({
      messageId,
      targeting: command.correctedTargeting,
      semesterRange: previousTargeting?.semesterRange ?? null,
      persistedAt: this.deps.clock.now()
    });

    // Criterios 1 y 4: fecha de cierre, sobre el mismo grupo consolidado.
    await this.deps.consolidatedRegistry.save({ ...consolidated, dueDate: command.correctedDueDate });

    // Criterios 3 y 4: el documento queda publicado, corregido o no antes.
    // "con la fecha corregida" (criterio 3) queda parcialmente diferido: el
    // contrato actual de NotificationSchedulingPort (HU-10, gap 2, stub de
    // HU-20) no transporta la fecha de cierre. Ampliarlo esta fuera de
    // alcance de esta historia; ver README.
    await this.deps.notificationSchedulingPort?.scheduleForPublication(correctedRecord);

    return correctedRecord;
  }
}
