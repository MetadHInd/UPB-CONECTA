import type { ClassificationResultRepositoryPort } from '../../classification/domain/ports/out/ClassificationResultRepositoryPort.js';
import type { ProgramTargetingRepositoryPort } from '../../targeting/domain/ports/out/ProgramTargetingRepositoryPort.js';
import { allCommunityTargeting } from '../../targeting/domain/value-objects/ProgramTargeting.js';
import { FacultyProgramResolver } from '../../targeting/domain/services/FacultyProgramResolver.js';
import { targetingIncludesProgram } from '../../targeting/domain/services/ProgramTargetingMembership.js';
import type { DueDateConvocatoriaSourcePort } from '../domain/ports/out/DueDateConvocatoriaSourcePort.js';
import type { StudentDirectoryPort } from '../domain/ports/out/StudentDirectoryPort.js';
import type { NotificationPreferencesRepositoryPort } from '../domain/ports/out/NotificationPreferencesRepositoryPort.js';
import type { EmittedReminderRegistryPort } from '../domain/ports/out/EmittedReminderRegistryPort.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import { defaultPreferences } from '../domain/entities/NotificationPreferences.js';
import { NotificationPreferencesPolicy } from '../domain/services/NotificationPreferencesPolicy.js';
import { NotificationScheduler, computeUrgency } from '../domain/services/NotificationScheduler.js';
import { AnticipationThreshold } from '../domain/value-objects/AnticipationThreshold.js';
import type { PendingNotification } from '../domain/entities/PendingNotification.js';

export interface EmitDueDateRemindersDependencies {
  readonly dueDateSource: DueDateConvocatoriaSourcePort;
  /**
   * Puerto de salida de `classification`, usado directamente por la misma
   * razon documentada en `NotifyProgramTargetedPublication`: es el mismo
   * patron que ya usa `GetSegmentedFeed` para decidir si un documento es
   * publicable.
   */
  readonly classificationResultRepo: ClassificationResultRepositoryPort;
  readonly programTargetingRepo: ProgramTargetingRepositoryPort;
  readonly facultyResolver: FacultyProgramResolver;
  readonly studentDirectory: StudentDirectoryPort;
  readonly preferencesRepo: NotificationPreferencesRepositoryPort;
  readonly emittedReminders: EmittedReminderRegistryPort;
  readonly systemThresholds: readonly AnticipationThreshold[];
  readonly clock: ClockPort;
}

/**
 * HU-19 (RF-27, RNF-03, RF-62): planificador de avisos de vencimiento.
 *
 * Diseno deliberado — sin timers por aviso individual. En vez de programar
 * un `setTimeout` por cada `(estudiante, convocatoria, umbral)` cuando la
 * convocatoria se publica, este caso de uso relee el estado vigente de cada
 * convocatoria con fecha de cierre en cada ciclo (invocado por
 * `DueDateReminderScheduler`, cada `pollIntervalMs`, criterio 2). Esa
 * eleccion es la que resuelve dos criterios "gratis", sin logica adicional:
 *
 * - Criterio 3 (recalcular al corregir la fecha de cierre): como el cierre
 *   se lee fresco en cada ciclo desde `dueDateSource`, una correccion ya
 *   esta reflejada en el siguiente ciclo, sin ninguna invalidacion
 *   explicita. Lo unico que hace falta es que la idempotencia (mas abajo) no
 *   confunda "ya avisado para el cierre viejo" con "ya avisado para el
 *   cierre nuevo" — por eso `EmittedReminderRegistryPort` incluye el cierre
 *   vigente en su clave.
 * - Criterios 4 y 5 (no emitir si la convocatoria esta retirada/vencida, o
 *   si el estudiante desactivo la categoria): se verifican aqui, en el
 *   instante de emision, no al "programar" — un aviso nunca se calcula sobre
 *   un estado que pudo quedar obsoleto entre que se decidio programarlo y
 *   que llego su instante. Mismo principio que ya aplica HU-46 al rol
 *   ("nunca cacheado, se lee fresco en cada llamada").
 *
 * Idempotencia: sin ella, cada ciclo posterior al instante de un aviso lo
 * volveria a producir. `EmittedReminderRegistryPort` es el registro que lo
 * evita (ver su documentacion para el detalle de la clave).
 */
export class EmitDueDateReminders {
  constructor(private readonly deps: EmitDueDateRemindersDependencies) {}

  async execute(): Promise<readonly PendingNotification[]> {
    const now = this.deps.clock.now();
    const scheduler = new NotificationScheduler();
    const policy = new NotificationPreferencesPolicy();
    const produced: PendingNotification[] = [];

    const candidates = await this.deps.dueDateSource.findWithDueDate();

    for (const candidate of candidates) {
      // Criterio 4: retirada o vencida no emite.
      if (candidate.withdrawn) continue;
      if (candidate.dueAt === null) continue;
      if (candidate.dueAt.getTime() < now.getTime()) continue;
      if (!candidate.representativeMessageId) continue;

      // Criterio 1: solo convocatorias efectivamente publicadas (no en revision pendiente).
      const classification = await this.deps.classificationResultRepo.findByMessageId(candidate.representativeMessageId);
      if (!classification || classification.publicationStatus !== 'published') continue;

      const targetingRecord = await this.deps.programTargetingRepo.findByMessageId(candidate.representativeMessageId);
      const targeting = targetingRecord?.targeting ?? allCommunityTargeting();

      const students = await this.deps.studentDirectory.findAll();
      const dueAt = candidate.dueAt;
      const dueAtEpochMs = dueAt.getTime();

      for (const student of students) {
        if (!targetingIncludesProgram(targeting, student.programId, this.deps.facultyResolver)) continue;

        const preferences = (await this.deps.preferencesRepo.findByStudent(student.studentId)) ?? defaultPreferences(student.studentId, now);

        // Criterio 5: categoria desactivada no emite.
        if (!policy.isCategoryEnabled(preferences, classification.finalCategory)) continue;

        const reminders = scheduler.computeReminders(
          dueAt,
          now,
          this.deps.systemThresholds,
          AnticipationThreshold.ofMinutes(preferences.leadTimeMinutes)
        );

        for (const reminder of reminders) {
          if (reminder.firesAt.getTime() > now.getTime()) continue; // todavia no llega su instante

          const already = await this.deps.emittedReminders.wasEmitted(
            student.studentId,
            candidate.convocatoriaId,
            reminder.thresholdMinutes,
            dueAtEpochMs
          );
          if (already) continue;

          produced.push({
            studentId: student.studentId,
            convocatoriaId: candidate.convocatoriaId,
            urgency: computeUrgency(dueAtEpochMs - now.getTime()),
            generatedAt: now
          });

          await this.deps.emittedReminders.markEmitted(student.studentId, candidate.convocatoriaId, reminder.thresholdMinutes, dueAtEpochMs, now);
        }
      }
    }

    return produced;
  }
}
