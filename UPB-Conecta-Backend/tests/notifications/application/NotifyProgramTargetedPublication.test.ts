import { describe, it, expect } from 'vitest';
import { NotifyProgramTargetedPublication } from '../../../src/contexts/notifications/application/NotifyProgramTargetedPublication.js';
import { InMemoryConsolidatedMessageRegistry } from '../../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryConsolidatedMessageRegistry.js';
import { InMemoryProgramTargetingRepository } from '../../../src/contexts/targeting/infrastructure/adapters/out/memory/InMemoryProgramTargetingRepository.js';
import { FacultyProgramResolver } from '../../../src/contexts/targeting/domain/services/FacultyProgramResolver.js';
import { programTargeting, allCommunityTargeting, facultyTargeting, type ProgramTargeting } from '../../../src/contexts/targeting/domain/value-objects/ProgramTargeting.js';
import { InMemoryNotificationPreferencesRepository } from '../../../src/contexts/notifications/infrastructure/adapters/out/memory/InMemoryNotificationPreferencesRepository.js';
import { FixedClock } from '../../../src/contexts/notifications/infrastructure/adapters/out/memory/SystemClock.js';
import type { StudentDirectoryEntry, StudentDirectoryPort } from '../../../src/contexts/notifications/domain/ports/out/StudentDirectoryPort.js';
import type { ConsolidatedMessageRecord } from '../../../src/contexts/ingestion/domain/ports/out/ConsolidatedMessageRegistryPort.js';

const CATALOG = {
  faculties: [{ id: 'fac-ing', name: 'Ingenieria', programIds: ['ing-sistemas', 'ing-industrial'] }],
  programs: [
    { id: 'ing-sistemas', name: 'Ingenieria de Sistemas', facultyId: 'fac-ing' },
    { id: 'ing-industrial', name: 'Ingenieria Industrial', facultyId: 'fac-ing' },
    { id: 'derecho', name: 'Derecho', facultyId: 'fac-derecho' }
  ]
};

class InMemoryStudentDirectory implements StudentDirectoryPort {
  constructor(private students: readonly StudentDirectoryEntry[]) {}
  async findAll(): Promise<readonly StudentDirectoryEntry[]> {
    return this.students;
  }
}

function baseConsolidatedRecord(overrides: Partial<ConsolidatedMessageRecord> = {}): ConsolidatedMessageRecord {
  return {
    sender: 'oficina@upb.edu.co',
    subject: 'Convocatoria de movilidad',
    body: 'texto',
    representativeMessageId: 'msg-1',
    firstSentAt: new Date('2026-01-01T00:00:00Z'),
    lastSentAt: new Date('2026-01-01T00:00:00Z'),
    resendCount: 0,
    dueDate: { kind: 'sin-vencimiento' },
    applicationLink: null,
    withdrawnAt: null,
    ...overrides
  };
}

function buildUseCase(opts: {
  readonly students: readonly StudentDirectoryEntry[];
  readonly consolidated?: ConsolidatedMessageRecord | null;
  readonly targeting?: ProgramTargeting;
}) {
  const consolidatedRegistry = new InMemoryConsolidatedMessageRegistry();
  const record = opts.consolidated === undefined ? baseConsolidatedRecord() : opts.consolidated;
  if (record) void consolidatedRegistry.save(record);

  const programTargetingRepo = new InMemoryProgramTargetingRepository();
  if (opts.targeting && record) {
    void programTargetingRepo.save({ messageId: record.representativeMessageId!, targeting: opts.targeting, persistedAt: new Date() });
  }

  const preferencesRepo = new InMemoryNotificationPreferencesRepository();
  const clock = new FixedClock(new Date('2026-01-02T00:00:00Z'));

  const useCase = new NotifyProgramTargetedPublication({
    consolidatedRegistry,
    programTargetingRepo,
    facultyResolver: new FacultyProgramResolver(CATALOG),
    studentDirectory: new InMemoryStudentDirectory(opts.students),
    preferencesRepo,
    clock
  });

  return { useCase, preferencesRepo, clock };
}

describe('NotifyProgramTargetedPublication (HU-20, RF-28, RF-61, RF-74)', () => {
  it('criterio 1: notifica a los estudiantes del programa al que se dirige la convocatoria publicada', async () => {
    const { useCase } = buildUseCase({
      students: [
        { studentId: 'est-sistemas@upb.edu.co', programId: 'ing-sistemas' },
        { studentId: 'est-derecho@upb.edu.co', programId: 'derecho' }
      ],
      targeting: programTargeting(['ing-sistemas'])
    });

    const notifications = await useCase.execute({ messageId: 'msg-1', category: 'beca' });

    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.studentId).toBe('est-sistemas@upb.edu.co');
  });

  it('criterio 2: un estudiante que desactivo la categoria no recibe el aviso aunque su programa aplique', async () => {
    const { useCase, preferencesRepo, clock } = buildUseCase({
      students: [{ studentId: 'est-1@upb.edu.co', programId: 'ing-sistemas' }],
      targeting: programTargeting(['ing-sistemas'])
    });
    await preferencesRepo.save({ studentId: 'est-1@upb.edu.co', categoryPreferences: { beca: false }, leadTimeMinutes: 1440, theme: 'light', updatedAt: clock.now() });

    const notifications = await useCase.execute({ messageId: 'msg-1', category: 'beca' });
    expect(notifications).toHaveLength(0);
  });

  it('criterio 3: dirigida a toda la comunidad, se aplica la preferencia de categoria antes de notificar', async () => {
    const { useCase, preferencesRepo, clock } = buildUseCase({
      students: [
        { studentId: 'est-1@upb.edu.co', programId: 'ing-sistemas' },
        { studentId: 'est-2@upb.edu.co', programId: 'derecho' }
      ],
      targeting: allCommunityTargeting()
    });
    await preferencesRepo.save({ studentId: 'est-2@upb.edu.co', categoryPreferences: { 'boletin informativo': false }, leadTimeMinutes: 1440, theme: 'light', updatedAt: clock.now() });

    const notifications = await useCase.execute({ messageId: 'msg-1', category: 'boletin informativo' });

    expect(notifications.map((n) => n.studentId)).toEqual(['est-1@upb.edu.co']);
  });

  it('sin registro de targeting, se trata como comunidad general', async () => {
    const { useCase } = buildUseCase({
      students: [{ studentId: 'est-1@upb.edu.co', programId: 'derecho' }]
    });

    const notifications = await useCase.execute({ messageId: 'msg-1', category: 'evento' });
    expect(notifications).toHaveLength(1);
  });

  it('un estudiante fuera del programa objetivo no recibe el aviso', async () => {
    const { useCase } = buildUseCase({
      students: [{ studentId: 'est-derecho@upb.edu.co', programId: 'derecho' }],
      targeting: programTargeting(['ing-sistemas'])
    });

    const notifications = await useCase.execute({ messageId: 'msg-1', category: 'beca' });
    expect(notifications).toHaveLength(0);
  });

  it('targeting por facultad incluye a todos los programas de esa facultad', async () => {
    const { useCase } = buildUseCase({
      students: [
        { studentId: 'est-sistemas@upb.edu.co', programId: 'ing-sistemas' },
        { studentId: 'est-industrial@upb.edu.co', programId: 'ing-industrial' },
        { studentId: 'est-derecho@upb.edu.co', programId: 'derecho' }
      ],
      targeting: facultyTargeting('fac-ing')
    });

    const notifications = await useCase.execute({ messageId: 'msg-1', category: 'evento' });
    expect(notifications.map((n) => n.studentId).sort()).toEqual(['est-industrial@upb.edu.co', 'est-sistemas@upb.edu.co']);
  });

  it('si no existe el mensaje representativo, no produce ningun aviso', async () => {
    const { useCase } = buildUseCase({ students: [{ studentId: 'est-1@upb.edu.co', programId: 'ing-sistemas' }], consolidated: null });
    const notifications = await useCase.execute({ messageId: 'msg-inexistente', category: 'evento' });
    expect(notifications).toHaveLength(0);
  });

  it('defensivo: una convocatoria ya retirada no genera un aviso de nueva convocatoria', async () => {
    const { useCase } = buildUseCase({
      students: [{ studentId: 'est-1@upb.edu.co', programId: 'ing-sistemas' }],
      consolidated: baseConsolidatedRecord({ withdrawnAt: new Date('2026-01-01T12:00:00Z') }),
      targeting: programTargeting(['ing-sistemas'])
    });

    const notifications = await useCase.execute({ messageId: 'msg-1', category: 'evento' });
    expect(notifications).toHaveLength(0);
  });

  it('cuando la convocatoria declara fecha de cierre, la urgencia del aviso refleja el tiempo restante', async () => {
    const { useCase } = buildUseCase({
      students: [{ studentId: 'est-1@upb.edu.co', programId: 'ing-sistemas' }],
      consolidated: baseConsolidatedRecord({ dueDate: { kind: 'con-fecha', date: new Date('2026-01-03T00:00:00Z') } }),
      targeting: programTargeting(['ing-sistemas'])
    });

    const notifications = await useCase.execute({ messageId: 'msg-1', category: 'beca' });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.urgency).toBeGreaterThan(1); // mayor que la urgencia base de una convocatoria sin vencimiento
  });

  it('criterio 5: invocar el caso de uso dos veces (simulando los dos publicadores) produce el mismo resultado', async () => {
    const { useCase } = buildUseCase({
      students: [{ studentId: 'est-1@upb.edu.co', programId: 'ing-sistemas' }],
      targeting: programTargeting(['ing-sistemas'])
    });

    const primera = await useCase.execute({ messageId: 'msg-1', category: 'evento' });
    const segunda = await useCase.execute({ messageId: 'msg-1', category: 'evento' });

    expect(primera.map((n) => n.studentId)).toEqual(segunda.map((n) => n.studentId));
  });
});
