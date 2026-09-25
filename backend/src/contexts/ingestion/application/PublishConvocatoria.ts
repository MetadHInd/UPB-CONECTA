import type { ConsolidatedMessageRecord, ConsolidatedMessageRegistryPort } from '../domain/ports/out/ConsolidatedMessageRegistryPort.js';
import type { DueDate } from '../domain/value-objects/DueDate.js';
import { convocatoriaIdToString, type ConvocatoriaId } from '../domain/value-objects/ConvocatoriaId.js';
import { ConvocatoriaAuditEventKind, type ConvocatoriaAuditLogPort } from '../domain/ports/out/ConvocatoriaAuditLogPort.js';
import type { ManualMessageIdGeneratorPort } from '../domain/ports/out/ManualMessageIdGeneratorPort.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { ClassificationResultRecord } from '../../classification/domain/entities/ClassificationResult.js';
import type { ClassificationResultRepositoryPort } from '../../classification/domain/ports/out/ClassificationResultRepositoryPort.js';
import type { NotificationSchedulingPort } from '../../classification/domain/ports/out/NotificationSchedulingPort.js';
import { ConfidenceScore } from '../../classification/domain/value-objects/ConfidenceScore.js';
import type { MessageCategory } from '../../classification/domain/value-objects/MessageCategory.js';
import type { ProgramTargeting } from '../../targeting/domain/value-objects/ProgramTargeting.js';
import type { SemesterRange } from '../../targeting/domain/value-objects/SemesterRange.js';
import type { ProgramTargetingRepositoryPort } from '../../targeting/domain/ports/out/ProgramTargetingRepositoryPort.js';

export interface PublishConvocatoriaCommand {
  readonly sender: string;
  readonly subject: string;
  readonly body: string;
  readonly dueDate: DueDate;
  readonly applicationLink: string | null;
  readonly category: MessageCategory;
  readonly targeting: ProgramTargeting;
  readonly semesterRange?: SemesterRange | null;
  /** Para la auditoria (criterio 6); tambien el rol se verifica en el borde con `AuthorizeOperation` (HU-46). */
  readonly publishedBy: string;
}

export interface PublishConvocatoriaResult {
  readonly convocatoriaId: ConvocatoriaId;
  readonly messageId: string;
}

export interface PublishConvocatoriaDependencies {
  readonly consolidatedRegistry: ConsolidatedMessageRegistryPort;
  readonly classificationResultRepo: ClassificationResultRepositoryPort;
  readonly programTargetingRepo: ProgramTargetingRepositoryPort;
  readonly auditLog: ConvocatoriaAuditLogPort;
  readonly messageIdGenerator: ManualMessageIdGeneratorPort;
  /** Opcional, igual que en `ClassifyInstitutionalMessage`: sin este puerto la publicacion se persiste igual, solo no dispara el aviso. */
  readonly notificationSchedulingPort?: NotificationSchedulingPort;
  readonly clock: ClockPort;
}

/**
 * HU-50 (RF-74, RF-36, RNF-18), criterios 1 y 2: publica una convocatoria
 * construida manualmente por un administrador de contenido, con los mismos
 * campos y el mismo efecto final que produce el pipeline automatico
 * (ingesta + clasificacion + segmentacion + notificacion).
 *
 * Decision — no se reutiliza literalmente `IngestInstitutionalMessages`. El
 * diseno de la historia en Jira dice "publicacion manual y publicacion
 * automatica invocan el mismo caso de uso `PublishConvocatoria`", lo que
 * sugiere refactorizar el pipeline automatico para delegar aqui. Se evaluo
 * y se descarto: `IngestInstitutionalMessages` ya tiene una politica de
 * reenvios, deduplicacion e idempotencia (HU-01 a HU-08) fuertemente
 * probada, y hacerle esa cirugia para esta historia es un riesgo alto fuera
 * de alcance. En su lugar, `PublishConvocatoria` reproduce el mismo estado
 * final escribiendo en los mismos tres repositorios que ya orquesta
 * `CorrectClassification` (HU-11): `ConsolidatedMessageRegistryPort`
 * (ingestion), `ClassificationResultRepositoryPort` (classification) y
 * `ProgramTargetingRepositoryPort` (targeting) — funcionalmente equivalente,
 * no literalmente el mismo objeto en memoria.
 *
 * Sin clasificador: la categoria la fija el administrador directamente
 * (`command.category`), con `confidenceScore = ConfidenceScore.certain()`
 * (1) porque no hay incertidumbre de modelo que reportar — es una decision
 * humana, no una prediccion.
 *
 * Sin validacion de esquema de entrada aqui a proposito: validar la forma de
 * los datos que llegan a un punto de entrada es el criterio 3 de HU-47
 * ("hardening del transporte, validacion de entradas"), historia hermana
 * en este mismo backlog. Mezclar esa responsabilidad aqui duplicaria esa
 * historia en dos lugares.
 */
export class PublishConvocatoria {
  constructor(private readonly deps: PublishConvocatoriaDependencies) {}

  async execute(command: PublishConvocatoriaCommand): Promise<PublishConvocatoriaResult> {
    const now = this.deps.clock.now();
    const messageId = this.deps.messageIdGenerator.newMessageId();

    const consolidatedRecord: ConsolidatedMessageRecord = {
      sender: command.sender,
      subject: command.subject,
      body: command.body,
      representativeMessageId: messageId,
      firstSentAt: now,
      lastSentAt: now,
      resendCount: 0,
      dueDate: command.dueDate,
      applicationLink: command.applicationLink,
      withdrawnAt: null
    };
    await this.deps.consolidatedRegistry.save(consolidatedRecord);

    const classificationRecord: ClassificationResultRecord = {
      messageId,
      proposedCategory: command.category,
      finalCategory: command.category,
      isKnownFalsePositiveCase: false,
      reason: 'Publicacion manual por administrador de contenido',
      appliedRuleId: null,
      confidenceScore: ConfidenceScore.certain().value,
      publicationStatus: 'published',
      persistedAt: now
    };
    await this.deps.classificationResultRepo.save(classificationRecord);

    await this.deps.programTargetingRepo.save({
      messageId,
      targeting: command.targeting,
      semesterRange: command.semesterRange ?? null,
      persistedAt: now
    });

    // Criterio 2: mismo flujo de notificacion que una convocatoria ingerida.
    await this.deps.notificationSchedulingPort?.scheduleForPublication(classificationRecord);

    const convocatoriaId: ConvocatoriaId = { sender: command.sender, subject: command.subject, firstSentAt: now };
    await this.deps.auditLog.record({
      kind: ConvocatoriaAuditEventKind.PUBLISHED,
      convocatoriaId: convocatoriaIdToString(convocatoriaId),
      messageId,
      actor: command.publishedBy,
      occurredAt: now
    });

    return { convocatoriaId, messageId };
  }
}
