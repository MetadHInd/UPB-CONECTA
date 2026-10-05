import { describe, it, expect } from 'vitest';
import { EmitDueDateReminders } from '../../../src/contexts/notifications/application/EmitDueDateReminders.js';
import { InMemoryClassificationResultRepository } from '../../../src/contexts/classification/infrastructure/adapters/out/memory/InMemoryClassificationResultRepository.js';
import { InMemoryProgramTargetingRepository } from '../../../src/contexts/targeting/infrastructure/adapters/out/memory/InMemoryProgramTargetingRepository.js';
import { FacultyProgramResolver } from '../../../src/contexts/targeting/domain/services/FacultyProgramResolver.js';
import { programTargeting } from '../../../src/contexts/targeting/domain/value-objects/ProgramTargeting.js';
import { InMemoryNotificationPreferencesRepository } from '../../../src/contexts/notifications/infrastructure/adapters/out/memory/InMemoryNotificationPreferencesRepository.js';
import { InMemoryEmittedReminderRegistry } from '../../../src/contexts/notifications/infrastructure/adapters/out/memory/InMemoryEmittedReminderRegistry.js';
import { InMemoryDueDateConvocatoriaSource } from '../../../src/contexts/notifications/infrastructure/adapters/out/memory/InMemoryDueDateConvocatoriaSource.js';
import { FixedClock } from '../../../src/contexts/notifications/infrastructure/adapters/out/memory/SystemClock.js';
import { AnticipationThreshold } from '../../../src/contexts/notifications/domain/value-objects/AnticipationThreshold.js';
import type { StudentDirectoryEntry, StudentDirectoryPort } from '../../../src/contexts/notifications/domain/ports/out/StudentDirectoryPort.js';
import type { DueDateConvocatoriaCandidate } from '../../../src/contexts/notifications/domain/ports/out/DueDateConvocatoriaSourcePort.js';
import type { ClassificationResultRecord } from '../../../src/contexts/classification/domain/entities/ClassificationResult.js';
import { MessageCategory } from '../../../src/contexts/classification/domain/value-objects/MessageCategory.js';

const CATALOG = {
  faculties: [{ id: 'fac-ing', name: 'Ingenieria', programIds: ['ing-sistemas'] }],
  programs: [{ id: 'ing-sistemas', name: 'Ingenieria de Sistemas', facultyId: 'fac-ing' }]
};

class InMemoryStudentDirectory implements StudentDirectoryPort {
  constructor(private students: readonly StudentDirectoryEntry[]) {}
  async findAll(): Promise<readonly StudentDirectoryEntry[]> {
    return this.students;
  }
}

function candidate(overrides: Partial<DueDateConvocatoriaCandidate> = {}): DueDateConvocatoriaCandidate {
  return {
    convocatoriaId: 'convocatoria-1',
    representativeMessageId: 'msg-1',
    dueAt: new Date('2026-01-10T12:00:00Z'),
    withdrawn: false,
    ...overrides
  };
}

function classification(overrides: Partial<ClassificationResultRecord> = {}): ClassificationResultRecord {
  return {
    messageId: 'msg-1',
    proposedCategory: MessageCategory.BECA,
    finalCategory: MessageCategory.BECA,
    isKnownFalsePositiveCase: false,
    reason: null,
    appliedRuleId: null,
    confidenceScore: 1,
    publicationStatus: 'published',
    persistedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides
  };
}

function buildUseCase(opts: {
  readonly now: Date;
  readonly candidates: readonly DueDateConvocatoriaCandidate[];
  readonly classifications?: readonly ClassificationResultRecord[];
  readonly students?: readonly StudentDirectoryEntry[];
  readonly targeting?: import('../../../src/contexts/targeting/domain/value-objects/ProgramTargeting.js').ProgramTargeting;
  readonly systemThresholds?: readonly AnticipationThreshold[];
}) {
  const dueDateSource = new InMemoryDueDateConvocatoriaSource(opts.candidates);
  const classificationResultRepo = new InMemoryClassificationResultRepository();
  for (const record of opts.classifications ?? [classification()]) {
    void classificationResultRepo.save(record);
  }

  const programTargetingRepo = new InMemoryProgramTargetingRepository();
  if (opts.targeting) {
    void programTargetingRepo.save({ messageId: 'msg-1', targeting: opts.targeting, persistedAt: new Date() });
  }

  const preferencesRepo = new InMemoryNotificationPreferencesRepository();
  const emittedReminders = new InMemoryEmittedReminderRegistry();
  const clock = new FixedClock(opts.now);

  const useCase = new EmitDueDateReminders({
    dueDateSource,
    classificationResultRepo,
    programTargetingRepo,
    facultyResolver: new FacultyProgramResolver(CATALOG),
    studentDirectory: new InMemoryStudentDirectory(opts.students ?? [{ studentId: 'est-1@upb.edu.co', programId: 'ing-sistemas' }]),
    preferencesRepo,
    emittedReminders,
    systemThresholds: opts.systemThresholds ?? [AnticipationThreshold.ofMinutes(1440)],
    clock
  });

  return { useCase, preferencesRepo, emittedReminders, clock, programTargetingRepo };
}

describe('EmitDueDateReminders (HU-19, RF-27, RNF-03, RF-62)', () => {
  it('criterio 1: genera un aviso cuando se alcanza el umbral configurado por el sistema', async () => {
    const { useCase } = buildUseCase({
      now: new Date('2026-01-09T12:00:00Z'), // exactamente 1 dia antes (umbral por defecto: 1440 min)
      candidates: [candidate()]
    });

    const notifications = await useCase.execute();
    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.studentId).toBe('est-1@upb.edu.co');
    expect(notifications[0]!.convocatoriaId).toBe('convocatoria-1');
  });

  it('criterio 1: tambien genera un aviso segun la anticipacion propia del estudiante, ademas del umbral del sistema', async () => {
    const { useCase, preferencesRepo, clock } = buildUseCase({
      now: new Date('2026-01-10T11:00:00Z'), // 1 hora antes: tanto el umbral del sistema (1 dia, ya vencido) como el del estudiante (1 hora, justo ahora) se alcanzaron.
      candidates: [candidate()]
    });
    await preferencesRepo.save({ studentId: 'est-1@upb.edu.co', categoryPreferences: {}, leadTimeMinutes: 60, theme: 'light', updatedAt: clock.now() });

    const notifications = await useCase.execute();
    // Dos avisos distintos para el mismo estudiante: uno por cada umbral alcanzado (sistema y propio).
    expect(notifications).toHaveLength(2);
    expect(notifications.every((n) => n.studentId === 'est-1@upb.edu.co')).toBe(true);
  });

  it('no genera ningun aviso antes de que se alcance cualquier umbral', async () => {
    const { useCase } = buildUseCase({
      now: new Date('2026-01-01T00:00:00Z'), // muy lejos del cierre (10 de enero)
      candidates: [candidate()]
    });

    expect(await useCase.execute()).toHaveLength(0);
  });

  it('idempotencia: el mismo aviso no se produce dos veces en ciclos sucesivos', async () => {
    const { useCase } = buildUseCase({
      now: new Date('2026-01-09T12:00:00Z'),
      candidates: [candidate()]
    });

    const primerCiclo = await useCase.execute();
    const segundoCiclo = await useCase.execute();

    expect(primerCiclo).toHaveLength(1);
    expect(segundoCiclo).toHaveLength(0);
  });

  it('criterio 3: si la fecha de cierre se corrige, el aviso se recalcula sobre la nueva fecha (no queda bloqueado por la idempotencia anterior)', async () => {
    const source = new InMemoryDueDateConvocatoriaSource([candidate({ dueAt: new Date('2026-01-10T12:00:00Z') })]);
    const classificationResultRepo = new InMemoryClassificationResultRepository();
    void classificationResultRepo.save(classification());
    const programTargetingRepo = new InMemoryProgramTargetingRepository();
    const preferencesRepo = new InMemoryNotificationPreferencesRepository();
    const emittedReminders = new InMemoryEmittedReminderRegistry();
    const clock = new FixedClock(new Date('2026-01-09T12:00:00Z'));

    const useCase = new EmitDueDateReminders({
      dueDateSource: source,
      classificationResultRepo,
      programTargetingRepo,
      facultyResolver: new FacultyProgramResolver(CATALOG),
      studentDirectory: new InMemoryStudentDirectory([{ studentId: 'est-1@upb.edu.co', programId: 'ing-sistemas' }]),
      preferencesRepo,
      emittedReminders,
      systemThresholds: [AnticipationThreshold.ofMinutes(1440)],
      clock
    });

    // Primer ciclo: se alcanzo el umbral de 1 dia respecto al cierre original.
    expect(await useCase.execute()).toHaveLength(1);
    expect(await useCase.execute()).toHaveLength(0); // ya emitido, no se repite

    // El administrador corrige el cierre a una fecha mas lejana: ya no falta
    // 1 dia (falta mas de uno), asi que un ciclo intermedio no vuelve a emitir...
    source.seed([candidate({ dueAt: new Date('2026-01-20T12:00:00Z') })]);
    expect(await useCase.execute()).toHaveLength(0);

    // ...pero cuando efectivamente falta 1 dia para la NUEVA fecha, se recalcula y se emite de nuevo.
    clock.advance(10 * 24 * 60 * 60_000 - 0); // avanza hasta 2026-01-19T12:00:00Z aprox
    const notifications = await useCase.execute();
    expect(notifications).toHaveLength(1);
  });

  it('criterio 4: una convocatoria retirada no emite el aviso pendiente', async () => {
    const { useCase } = buildUseCase({
      now: new Date('2026-01-09T12:00:00Z'),
      candidates: [candidate({ withdrawn: true })]
    });

    expect(await useCase.execute()).toHaveLength(0);
  });

  it('criterio 4: una convocatoria vencida no emite el aviso pendiente', async () => {
    const { useCase } = buildUseCase({
      now: new Date('2026-01-11T00:00:00Z'), // despues del cierre (10 de enero)
      candidates: [candidate()]
    });

    expect(await useCase.execute()).toHaveLength(0);
  });

  it('defensivo: un candidato sin mensaje representativo no puede verificarse y no emite', async () => {
    const { useCase } = buildUseCase({
      now: new Date('2026-01-09T12:00:00Z'),
      candidates: [candidate({ representativeMessageId: null })]
    });

    expect(await useCase.execute()).toHaveLength(0);
  });

  it('sin fecha de cierre concreta (sin-vencimiento/ambigua) no hay nada que programar', async () => {
    const { useCase } = buildUseCase({
      now: new Date('2026-01-09T12:00:00Z'),
      candidates: [candidate({ dueAt: null })]
    });

    expect(await useCase.execute()).toHaveLength(0);
  });

  it('criterio 5: un estudiante que desactivo la categoria de la convocatoria no recibe el aviso', async () => {
    const { useCase, preferencesRepo, clock } = buildUseCase({
      now: new Date('2026-01-09T12:00:00Z'),
      candidates: [candidate()]
    });
    await preferencesRepo.save({ studentId: 'est-1@upb.edu.co', categoryPreferences: { beca: false }, leadTimeMinutes: 1440, theme: 'light', updatedAt: clock.now() });

    expect(await useCase.execute()).toHaveLength(0);
  });

  it('una convocatoria en revision pendiente (no publicada) no genera avisos', async () => {
    const { useCase } = buildUseCase({
      now: new Date('2026-01-09T12:00:00Z'),
      candidates: [candidate()],
      classifications: [classification({ publicationStatus: 'pending-review' })]
    });

    expect(await useCase.execute()).toHaveLength(0);
  });

  it('un estudiante fuera del programa objetivo no recibe el aviso', async () => {
    const { useCase } = buildUseCase({
      now: new Date('2026-01-09T12:00:00Z'),
      candidates: [candidate()],
      targeting: programTargeting(['otro-programa'])
    });

    expect(await useCase.execute()).toHaveLength(0);
  });

  it('criterio 6: convocatoria publicada con menos tiempo restante que el umbral emite el aviso de inmediato', async () => {
    const { useCase } = buildUseCase({
      now: new Date('2026-01-10T11:30:00Z'), // solo 30 minutos antes del cierre
      candidates: [candidate()],
      systemThresholds: [AnticipationThreshold.ofMinutes(1440)] // umbral de 1 dia, ya inalcanzable
    });

    const notifications = await useCase.execute();
    expect(notifications).toHaveLength(1);
  });

  it('varios umbrales alcanzados a la vez producen avisos independientes (sin duplicar en el mismo ciclo si coinciden en minutos)', async () => {
    const { useCase } = buildUseCase({
      now: new Date('2026-01-09T12:00:00Z'),
      candidates: [candidate()],
      systemThresholds: [AnticipationThreshold.ofMinutes(1440), AnticipationThreshold.ofMinutes(4320)]
    });
    // A esta hora solo se alcanzo el umbral de 1 dia (1440), el de 3 dias (4320) ya paso hace rato
    // y tambien deberia considerarse alcanzado (immediate) la primera vez.
    const notifications = await useCase.execute();
    expect(notifications).toHaveLength(2);
  });
});
