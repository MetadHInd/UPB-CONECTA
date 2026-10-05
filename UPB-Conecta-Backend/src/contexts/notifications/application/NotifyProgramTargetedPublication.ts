import type { ConsolidatedMessageRegistryPort } from '../../ingestion/domain/ports/out/ConsolidatedMessageRegistryPort.js';
import { convocatoriaIdToString } from '../../ingestion/domain/value-objects/ConvocatoriaId.js';
import type { ProgramTargetingRepositoryPort } from '../../targeting/domain/ports/out/ProgramTargetingRepositoryPort.js';
import { allCommunityTargeting } from '../../targeting/domain/value-objects/ProgramTargeting.js';
import { FacultyProgramResolver } from '../../targeting/domain/services/FacultyProgramResolver.js';
import { targetingIncludesProgram } from '../../targeting/domain/services/ProgramTargetingMembership.js';
import type { StudentDirectoryPort } from '../domain/ports/out/StudentDirectoryPort.js';
import type { NotificationPreferencesRepositoryPort } from '../domain/ports/out/NotificationPreferencesRepositoryPort.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import { defaultPreferences } from '../domain/entities/NotificationPreferences.js';
import { NotificationPreferencesPolicy } from '../domain/services/NotificationPreferencesPolicy.js';
import { computeUrgency } from '../domain/services/NotificationScheduler.js';
import type { PendingNotification } from '../domain/entities/PendingNotification.js';

export interface NotifyProgramTargetedPublicationCommand {
  readonly messageId: string;
  readonly category: string;
}

export interface NotifyProgramTargetedPublicationDependencies {
  /**
   * Puerto de salida de `ingestion`, usado directamente (sin envolver en un
   * puerto propio): es lectura de un dato ya publicado a traves de un
   * puerto que `ingestion` ya expone (`findByRepresentativeMessageId`), el
   * mismo patron que ya usan `GetSegmentedFeed` (`feed`) y `PublishConvocatoria`
   * (`ingestion`) para leer entre contextos en la capa de aplicacion. Se
   * reserva el patron "puerto propio + adaptador" (`StudentDirectoryPort`)
   * para lo que `profile` no exponia todavia.
   */
  readonly consolidatedRegistry: ConsolidatedMessageRegistryPort;
  readonly programTargetingRepo: ProgramTargetingRepositoryPort;
  readonly facultyResolver: FacultyProgramResolver;
  readonly studentDirectory: StudentDirectoryPort;
  readonly preferencesRepo: NotificationPreferencesRepositoryPort;
  readonly clock: ClockPort;
}

/**
 * HU-20 (RF-28, RF-61, RF-74): notifica a los estudiantes del programa
 * objetivo cuando una convocatoria se publica.
 *
 * Es el unico suscriptor de "una convocatoria se publico" en este backend.
 * El diseno de la historia en Jira habla de un evento de dominio
 * `ConvocatoriaPublished`; no existe infraestructura de eventos en el
 * proyecto (no hay `DomainEvent`/`EventBus` en ningun contexto) y el patron
 * real ya usado para "un caso de uso dispara efectos en otro contexto" es
 * composicion directa de casos de uso/puertos (`AuthenticateStudent` con
 * `ConsentStatusPort`/`AuthenticatedProfileSyncPort`). Este caso de uso es
 * justamente el que implementa `NotificationSchedulingPort` — el puerto que
 * `classification` ya declaro en HU-10 pensando en esta historia
 * ("stub de HU-20" dice su propio comentario) y que `ClassifyInstitutionalMessage`
 * (ingesta automatica), `CorrectClassification` (correccion manual, HU-11) y,
 * a traves de ella, `PublishReviewQueueItem` (HU-49, "publicar sin cambios")
 * y `PublishConvocatoria` (HU-50, publicacion manual) ya invocan al llegar a
 * `publicationStatus: 'published'`. Los cuatro puntos de entrada —
 * automatico, correccion, cola de revision y publicacion manual — convergen
 * en el mismo `scheduleForPublication`, que es exactamente "mismo caso de
 * uso, mismo evento" (criterio 5) sin tocar ni ingestion ni classification
 * ni moderation: el enganche ya estaba construido, solo faltaba una
 * implementacion real en vez del stub en memoria.
 */
export class NotifyProgramTargetedPublication {
  constructor(private readonly deps: NotifyProgramTargetedPublicationDependencies) {}

  async execute(command: NotifyProgramTargetedPublicationCommand): Promise<readonly PendingNotification[]> {
    const now = this.deps.clock.now();

    const consolidated = await this.deps.consolidatedRegistry.findByRepresentativeMessageId(command.messageId);
    if (!consolidated) return [];
    // Defensivo: en la practica este caso de uso solo se invoca al publicar
    // (ver documentacion de arriba), pero una convocatoria ya retirada nunca
    // debe generar un aviso de "nueva convocatoria".
    if (consolidated.withdrawnAt) return [];

    const convocatoriaId = convocatoriaIdToString({
      sender: consolidated.sender,
      subject: consolidated.subject,
      firstSentAt: consolidated.firstSentAt
    });

    const targetingRecord = await this.deps.programTargetingRepo.findByMessageId(command.messageId);
    const targeting = targetingRecord?.targeting ?? allCommunityTargeting();

    const students = await this.deps.studentDirectory.findAll();
    const policy = new NotificationPreferencesPolicy();

    const dueAt = consolidated.dueDate.kind === 'con-fecha' ? consolidated.dueDate.date : null;
    const urgency = computeUrgency(dueAt ? dueAt.getTime() - now.getTime() : null);

    const produced: PendingNotification[] = [];
    for (const student of students) {
      // Criterio 1: solo el publico dirigido (o, criterio 3, toda la comunidad).
      if (!targetingIncludesProgram(targeting, student.programId, this.deps.facultyResolver)) continue;

      const preferences = (await this.deps.preferencesRepo.findByStudent(student.studentId)) ?? defaultPreferences(student.studentId, now);

      // Criterio 2 (y 3, sobre contenido general): categoria desactivada no notifica.
      if (!policy.isCategoryEnabled(preferences, command.category)) continue;

      produced.push({ studentId: student.studentId, convocatoriaId, urgency, generatedAt: now });
    }

    return produced;
  }
}
