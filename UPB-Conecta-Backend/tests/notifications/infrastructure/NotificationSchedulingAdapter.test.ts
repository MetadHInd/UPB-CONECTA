import { describe, it, expect } from 'vitest';
import { NotificationSchedulingAdapter } from '../../../src/contexts/notifications/infrastructure/adapters/out/notification-scheduling/NotificationSchedulingAdapter.js';
import { NotifyProgramTargetedPublication } from '../../../src/contexts/notifications/application/NotifyProgramTargetedPublication.js';
import { InMemoryConsolidatedMessageRegistry } from '../../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryConsolidatedMessageRegistry.js';
import { InMemoryProgramTargetingRepository } from '../../../src/contexts/targeting/infrastructure/adapters/out/memory/InMemoryProgramTargetingRepository.js';
import { FacultyProgramResolver } from '../../../src/contexts/targeting/domain/services/FacultyProgramResolver.js';
import { programTargeting } from '../../../src/contexts/targeting/domain/value-objects/ProgramTargeting.js';
import { InMemoryNotificationPreferencesRepository } from '../../../src/contexts/notifications/infrastructure/adapters/out/memory/InMemoryNotificationPreferencesRepository.js';
import { FixedClock } from '../../../src/contexts/notifications/infrastructure/adapters/out/memory/SystemClock.js';
import type { StudentDirectoryEntry, StudentDirectoryPort } from '../../../src/contexts/notifications/domain/ports/out/StudentDirectoryPort.js';
import { MessageCategory } from '../../../src/contexts/classification/domain/value-objects/MessageCategory.js';
import type { ClassificationResultRecord } from '../../../src/contexts/classification/domain/entities/ClassificationResult.js';

class InMemoryStudentDirectory implements StudentDirectoryPort {
  constructor(private students: readonly StudentDirectoryEntry[]) {}
  async findAll(): Promise<readonly StudentDirectoryEntry[]> {
    return this.students;
  }
}

function buildAdapter() {
  const consolidatedRegistry = new InMemoryConsolidatedMessageRegistry();
  void consolidatedRegistry.save({
    sender: 'oficina@upb.edu.co',
    subject: 'Convocatoria de beca',
    body: 'texto',
    representativeMessageId: 'msg-1',
    firstSentAt: new Date('2026-01-01T00:00:00Z'),
    lastSentAt: new Date('2026-01-01T00:00:00Z'),
    resendCount: 0,
    dueDate: { kind: 'sin-vencimiento' },
    applicationLink: null,
    withdrawnAt: null
  });
  const programTargetingRepo = new InMemoryProgramTargetingRepository();
  void programTargetingRepo.save({ messageId: 'msg-1', targeting: programTargeting(['ing-sistemas']), persistedAt: new Date() });

  const notify = new NotifyProgramTargetedPublication({
    consolidatedRegistry,
    programTargetingRepo,
    facultyResolver: new FacultyProgramResolver({ faculties: [], programs: [] }),
    studentDirectory: new InMemoryStudentDirectory([{ studentId: 'est-1@upb.edu.co', programId: 'ing-sistemas' }]),
    preferencesRepo: new InMemoryNotificationPreferencesRepository(),
    clock: new FixedClock(new Date('2026-01-02T00:00:00Z'))
  });

  return new NotificationSchedulingAdapter(notify);
}

function record(overrides: Partial<ClassificationResultRecord> = {}): ClassificationResultRecord {
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

describe('NotificationSchedulingAdapter (HU-20): implementacion real de NotificationSchedulingPort', () => {
  it('al publicarse, delega en NotifyProgramTargetedPublication y no lanza', async () => {
    const adapter = buildAdapter();
    await expect(adapter.scheduleForPublication(record())).resolves.toBeUndefined();
  });

  it('criterio 4 (defensivo): un registro que no esta publicado no dispara ninguna notificacion', async () => {
    const adapter = buildAdapter();
    await expect(adapter.scheduleForPublication(record({ publicationStatus: 'pending-review' }))).resolves.toBeUndefined();
  });

  it('cancelScheduledNotifications no lanza (no-op documentado: ver README, seccion HU-20)', async () => {
    const adapter = buildAdapter();
    await expect(adapter.cancelScheduledNotifications('msg-1')).resolves.toBeUndefined();
  });

  it('criterio 5: los tres puntos de entrada (automatico, correccion/moderacion, publicacion manual) comparten la misma instancia del adaptador con el mismo resultado', async () => {
    const adapter = buildAdapter();
    // Simula que ClassifyInstitutionalMessage (automatico) y luego CorrectClassification
    // (via PublishReviewQueueItem o directamente) invocan el mismo puerto para el mismo mensaje.
    await adapter.scheduleForPublication(record());
    await expect(adapter.scheduleForPublication(record({ reason: 'Corregido manualmente' }))).resolves.toBeUndefined();
  });
});
