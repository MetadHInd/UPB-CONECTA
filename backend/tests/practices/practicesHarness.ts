import { InMemoryClassificationResultRepository } from '../../src/contexts/classification/infrastructure/adapters/out/memory/InMemoryClassificationResultRepository.js';
import { InMemoryNotificationSchedulingPort } from '../../src/contexts/classification/infrastructure/adapters/out/memory/InMemoryNotificationSchedulingPort.js';
import type { ClassificationResultRepositoryPort } from '../../src/contexts/classification/domain/ports/out/ClassificationResultRepositoryPort.js';
import { GetSegmentedFeed } from '../../src/contexts/feed/application/GetSegmentedFeed.js';
import { EditConvocatoria } from '../../src/contexts/ingestion/application/EditConvocatoria.js';
import { PublishConvocatoria } from '../../src/contexts/ingestion/application/PublishConvocatoria.js';
import { WithdrawConvocatoria } from '../../src/contexts/ingestion/application/WithdrawConvocatoria.js';
import type { ConsolidatedMessageRegistryPort } from '../../src/contexts/ingestion/domain/ports/out/ConsolidatedMessageRegistryPort.js';
import type { ConvocatoriaAuditLogPort } from '../../src/contexts/ingestion/domain/ports/out/ConvocatoriaAuditLogPort.js';
import { convocatoriaIdToString } from '../../src/contexts/ingestion/domain/value-objects/ConvocatoriaId.js';
import { RandomManualMessageIdGenerator } from '../../src/contexts/ingestion/infrastructure/adapters/out/crypto/RandomManualMessageIdGenerator.js';
import { InMemoryConsolidatedMessageRegistry } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryConsolidatedMessageRegistry.js';
import { InMemoryConvocatoriaAuditLog } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryConvocatoriaAuditLog.js';
import { EmitDueDateReminders } from '../../src/contexts/notifications/application/EmitDueDateReminders.js';
import type { DueDateConvocatoriaSourcePort } from '../../src/contexts/notifications/domain/ports/out/DueDateConvocatoriaSourcePort.js';
import type { StudentDirectoryEntry } from '../../src/contexts/notifications/domain/ports/out/StudentDirectoryPort.js';
import { AnticipationThreshold } from '../../src/contexts/notifications/domain/value-objects/AnticipationThreshold.js';
import { InMemoryEmittedReminderRegistry } from '../../src/contexts/notifications/infrastructure/adapters/out/memory/InMemoryEmittedReminderRegistry.js';
import { InMemoryNotificationPreferencesRepository } from '../../src/contexts/notifications/infrastructure/adapters/out/memory/InMemoryNotificationPreferencesRepository.js';
import { PracticeTrackingFollowersAdapter } from '../../src/contexts/notifications/infrastructure/adapters/out/practices/PracticeTrackingFollowersAdapter.js';
import { EditPracticeOffer } from '../../src/contexts/practices/application/EditPracticeOffer.js';
import { GetPracticeApplicationTracking } from '../../src/contexts/practices/application/GetPracticeApplicationTracking.js';
import { TrackPracticeApplication } from '../../src/contexts/practices/application/TrackPracticeApplication.js';
import type { PracticeApplicationTrackingRepositoryPort } from '../../src/contexts/practices/domain/ports/out/PracticeApplicationTrackingRepositoryPort.js';
import { InMemoryPracticeApplicationTrackingRepository } from '../../src/contexts/practices/infrastructure/adapters/out/memory/InMemoryPracticeApplicationTrackingRepository.js';
import { PublishPracticeOffer } from '../../src/contexts/practices/application/PublishPracticeOffer.js';
import { WithdrawPracticeOffer } from '../../src/contexts/practices/application/WithdrawPracticeOffer.js';
import { GetPracticeOfferDetail } from '../../src/contexts/practices/application/GetPracticeOfferDetail.js';
import { ListPracticeOffers } from '../../src/contexts/practices/application/ListPracticeOffers.js';
import { loadPracticeListingPolicy } from '../../src/contexts/practices/infrastructure/config/PracticeListingPolicyConfig.js';
import { CompositePracticeConvocatoriaSource } from '../../src/contexts/practices/infrastructure/adapters/out/composite/CompositePracticeConvocatoriaSource.js';
import type { PracticeOfferRepositoryPort } from '../../src/contexts/practices/domain/ports/out/PracticeOfferRepositoryPort.js';
import { InMemoryPracticeOfferRepository } from '../../src/contexts/practices/infrastructure/adapters/out/memory/InMemoryPracticeOfferRepository.js';
import type { InstitutionalProgramCatalog } from '../../src/contexts/targeting/domain/ports/out/ProgramCatalogPort.js';
import type { ProgramTargetingRepositoryPort } from '../../src/contexts/targeting/domain/ports/out/ProgramTargetingRepositoryPort.js';
import { FacultyProgramResolver } from '../../src/contexts/targeting/domain/services/FacultyProgramResolver.js';
import { InMemoryProgramTargetingRepository } from '../../src/contexts/targeting/infrastructure/adapters/out/memory/InMemoryProgramTargetingRepository.js';

export const PRACTICES_CATALOG: InstitutionalProgramCatalog = {
  faculties: [
    { id: 'ingenieria', name: 'Facultad de Ingeniería', programIds: ['sistemas', 'industrial'] },
    { id: 'humanidades', name: 'Facultad de Humanidades', programIds: ['psicologia'] }
  ],
  programs: [
    { id: 'sistemas', name: 'Ingeniería de Sistemas', facultyId: 'ingenieria' },
    { id: 'industrial', name: 'Ingeniería Industrial', facultyId: 'ingenieria' },
    { id: 'psicologia', name: 'Psicología', facultyId: 'humanidades' }
  ]
};

export const ADMIN = 'admin-practicas@upb.edu.co';
export const T0 = new Date('2026-09-26T15:00:00Z');

export const STUDENTS: readonly StudentDirectoryEntry[] = [
  { studentId: 'ana@upb.edu.co', programId: 'sistemas' },
  { studentId: 'ivan@upb.edu.co', programId: 'industrial' },
  { studentId: 'luis@upb.edu.co', programId: 'psicologia' }
];

/** Formulario completo y valido: lo que el administrador diligencia (criterio 1). */
export function validForm(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    company: 'Banco Digital S.A.',
    description: 'Práctica en el equipo de desarrollo móvil.',
    requirements: 'Estudiante de 8.º semestre en adelante, Kotlin básico.',
    modality: 'hibrida',
    targeting: { kind: 'programs', programIds: ['sistemas'] },
    dueDate: '2026-10-15T22:00:00Z',
    applicationChannel: 'https://practicas.upb.edu.co/oferta/482',
    ...overrides
  };
}

/**
 * Cablea el backoffice de practicas sobre los casos de uso de convocatoria
 * de HU-50, mas el feed segmentado (HU-12) y el planificador de avisos
 * (HU-19) reales, para verificar los criterios 2 y 5 de extremo a extremo.
 */
export function buildPracticesHarness(
  options: {
    readonly registry?: ConsolidatedMessageRegistryPort;
    readonly classifications?: ClassificationResultRepositoryPort;
    readonly targetingRepo?: ProgramTargetingRepositoryPort;
    readonly auditLog?: ConvocatoriaAuditLogPort;
    readonly offers?: PracticeOfferRepositoryPort;
    readonly trackings?: PracticeApplicationTrackingRepositoryPort;
  } = {}
) {
  let now = T0;
  const clock = { now: () => now };
  const registry = options.registry ?? new InMemoryConsolidatedMessageRegistry();
  const classifications = options.classifications ?? new InMemoryClassificationResultRepository();
  const targetingRepo = options.targetingRepo ?? new InMemoryProgramTargetingRepository();
  const auditLog = options.auditLog ?? new InMemoryConvocatoriaAuditLog();
  const offers = options.offers ?? new InMemoryPracticeOfferRepository();
  const trackings = options.trackings ?? new InMemoryPracticeApplicationTrackingRepository();
  const preferences = new InMemoryNotificationPreferencesRepository();
  const scheduling = new InMemoryNotificationSchedulingPort();
  const faculties = new FacultyProgramResolver(PRACTICES_CATALOG);

  const publishConvocatoria = new PublishConvocatoria({
    consolidatedRegistry: registry,
    classificationResultRepo: classifications,
    programTargetingRepo: targetingRepo,
    auditLog,
    messageIdGenerator: new RandomManualMessageIdGenerator(),
    notificationSchedulingPort: scheduling,
    clock
  });
  const editConvocatoria = new EditConvocatoria({ consolidatedRegistry: registry, programTargetingRepo: targetingRepo, auditLog, clock });
  const withdrawConvocatoria = new WithdrawConvocatoria({ consolidatedRegistry: registry, auditLog, notificationSchedulingPort: scheduling, clock });

  // Fuentes del feed y del planificador sobre lo publicado: en produccion las
  // dos leen la misma coleccion `ingestion_consolidated_messages`.
  const published: string[] = [];
  const entries = async () =>
    (await Promise.all(published.map((messageId) => registry.findByRepresentativeMessageId(messageId))))
      .filter((record) => record !== null)
      .map((record) => ({ id: convocatoriaIdToString(record!), record: record! }));
  const feed = new GetSegmentedFeed({
    convocatoriaRepo: { findSegmentedFeed: entries },
    programTargetingRepo: targetingRepo,
    facultyResolver: faculties,
    classificationResultRepo: classifications,
    classificationRetryQueue: { contains: async () => false }
  });
  const dueDateSource: DueDateConvocatoriaSourcePort = {
    findWithDueDate: async () =>
      (await entries()).map(({ id, record }) => ({
        convocatoriaId: id,
        representativeMessageId: record.representativeMessageId ?? null,
        dueAt: record.dueDate.kind === 'con-fecha' ? record.dueDate.date : null,
        withdrawn: Boolean(record.withdrawnAt)
      }))
  };
  const reminders = new EmitDueDateReminders({
    dueDateSource,
    classificationResultRepo: classifications,
    programTargetingRepo: targetingRepo,
    facultyResolver: faculties,
    studentDirectory: { findAll: async () => STUDENTS },
    preferencesRepo: preferences,
    emittedReminders: new InMemoryEmittedReminderRegistry(),
    systemThresholds: [AnticipationThreshold.ofMinutes(24 * 60)],
    clock,
    followers: new PracticeTrackingFollowersAdapter(trackings)
  });

  const source = new CompositePracticeConvocatoriaSource({ registry, classifications, targeting: targetingRepo, offers });
  const duplicateRules = loadPracticeListingPolicy();
  const publish = new PublishPracticeOffer({
    publishConvocatoria,
    editConvocatoria,
    offers,
    source,
    duplicateRules,
    catalog: PRACTICES_CATALOG,
    clock
  });

  return {
    registry,
    classifications,
    targetingRepo,
    auditLog,
    offers,
    trackings,
    preferences,
    scheduling,
    now: () => now,
    setNow(date: Date) {
      now = date;
    },
    publish: {
      async execute(input: Parameters<PublishPracticeOffer['execute']>[0]) {
        const result = await publish.execute(input);
        if (result.ok) published.push(result.offer.messageId);
        return result;
      }
    },
    edit: new EditPracticeOffer({ editConvocatoria, offers, catalog: PRACTICES_CATALOG, clock }),
    withdraw: new WithdrawPracticeOffer({ withdrawConvocatoria, offers, clock }),
    withdrawConvocatoria,
    /** HU-22: listado y detalle de la oferta consolidada. */
    list: new ListPracticeOffers({ source, catalog: PRACTICES_CATALOG, clock }),
    detail: new GetPracticeOfferDetail({ source, clock }),
    /** HU-23: seguimiento personal de postulaciones. */
    track: new TrackPracticeApplication({ trackings, source, clock }),
    tracking: new GetPracticeApplicationTracking({ trackings, source, clock }),
    /** Ids del feed que ve un estudiante del programa dado. */
    async feedFor(programId: string) {
      return (await feed.execute({ program: programId })).feed.map((entry) => entry.record.representativeMessageId);
    },
    /** Un ciclo del planificador de vencimiento (HU-19): quien recibe aviso ahora. */
    async reminderCycle() {
      return (await reminders.execute()).map((notification) => notification.studentId);
    }
  };
}
