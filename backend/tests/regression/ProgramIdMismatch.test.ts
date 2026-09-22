import { describe, expect, it } from 'vitest';
import { GetSegmentedFeed } from '../../src/contexts/feed/application/GetSegmentedFeed.js';
import { GetStudentFeed } from '../../src/contexts/feed/application/GetStudentFeed.js';
import { MessageId } from '../../src/contexts/ingestion/domain/value-objects/MessageId.js';
import { SyncStudentProfileFromDirectory } from '../../src/contexts/profile/application/SyncStudentProfileFromDirectory.js';
import { createSemesterBounds } from '../../src/contexts/profile/domain/value-objects/SemesterNumber.js';
import { InMemoryStudentProfileRepository } from '../../src/contexts/profile/infrastructure/adapters/out/memory/InMemoryStudentProfileRepository.js';
import { FeedStudentSegmentAdapter } from '../../src/contexts/profile/infrastructure/integration/FeedStudentSegmentAdapter.js';
import { IdentityProfileSyncAdapter } from '../../src/contexts/profile/infrastructure/integration/IdentityProfileSyncAdapter.js';
import { FacultyProgramResolver } from '../../src/contexts/targeting/domain/services/FacultyProgramResolver.js';
import { ProgramTargetingResolver } from '../../src/contexts/targeting/domain/services/ProgramTargetingResolver.js';
import { InMemoryProgramTargetingRepository } from '../../src/contexts/targeting/infrastructure/adapters/out/memory/InMemoryProgramTargetingRepository.js';
import { loadProgramCatalog } from '../../src/contexts/targeting/infrastructure/config/JsonProgramCatalogProvider.js';
import { buildSessionHarness, STUDENT } from '../identity/sessionHarness.js';

/**
 * REGRESIÓN PENDIENTE (confirmada en HU-37, se resuelve en una historia aparte).
 *
 * El directorio entrega el programa por nombre ('Ingeniería de Sistemas') y el
 * targeting usa ids del catálogo ('sistemas'), así que ninguna convocatoria
 * dirigida a un programa o a una facultad le llega a ningún estudiante.
 *
 * La prueba afirma el comportamiento CORRECTO y está marcada con `it.fails`:
 * hoy falla (bug presente) y por eso la suite queda en verde. Cuando se
 * traduzca el programa al id del catálogo, empezará a pasar, `it.fails` la
 * pondrá en rojo, y quien lo corrija debe cambiar `it.fails` por `it`.
 */
describe('REGRESIÓN — programa del directorio (nombre) vs. targeting (id)', () => {
  it.fails('con piezas reales, un estudiante de Sistemas ve las convocatorias de Sistemas y de su facultad', async () => {
    const catalog = await loadProgramCatalog(); // config/program-catalog.json real
    const profiles = new InMemoryStudentProfileRepository();
    const sync = new SyncStudentProfileFromDirectory({ profiles, clock: { now: () => new Date() }, bounds: createSemesterBounds(12) });
    // Adaptador de identidad en memoria con su cuenta POR DEFECTO (no se registra nada).
    const identity = buildSessionHarness({ profileSync: new IdentityProfileSyncAdapter(sync) });
    const login = await identity.authenticate.execute({ ...STUDENT, origin: '10.0.0.1' });
    if (!login.ok) throw new Error('login');

    // Targeting calculado por el resolver real a partir del texto de un correo.
    const resolver = new ProgramTargetingResolver(catalog);
    const mail = (id: string, body: string) => ({
      messageId: MessageId.fromHeader(`<${id}@upb.edu.co>`), mailboxUid: 1, sender: 'x@upb.edu.co', subject: 'Convocatoria',
      sentAt: new Date(), recipients: [], body, attachments: []
    });
    const targetingRepo = new InMemoryProgramTargetingRepository();
    const cases = {
      programa: resolver.resolveFromMessage(mail('p', 'Convocatoria para estudiantes de Ingeniería de Sistemas.')),
      facultad: resolver.resolveFromMessage(mail('f', 'Convocatoria dirigida a la Facultad de Ingeniería.')),
      general: resolver.resolveFromMessage(mail('g', 'Comunicado para toda la comunidad.'))
    };
    for (const [id, targeting] of Object.entries(cases)) await targetingRepo.save({ messageId: id, targeting, persistedAt: new Date() });

    const feed = new GetStudentFeed({
      segments: new FeedStudentSegmentAdapter(profiles),
      feed: new GetSegmentedFeed({
        convocatoriaRepo: { findSegmentedFeed: async () => Object.keys(cases).map((id) => ({ id, record: { representativeMessageId: id } as never })) },
        programTargetingRepo: targetingRepo,
        facultyResolver: new FacultyProgramResolver(catalog)
      })
    });
    const visible = (await feed.execute(login.profile.email)).feed.map((e) => e.id);

    // Precondiciones que hacen el caso realista (se cumplen hoy).
    expect(cases.programa).toEqual({ kind: 'programs', programIds: ['sistemas'] });
    expect(cases.facultad).toEqual({ kind: 'faculty', facultyId: 'ingenieria' });
    expect(login.profile.program).toBe('Ingeniería de Sistemas');

    // Comportamiento correcto (falla hoy: solo se ve 'general').
    expect(visible).toEqual(['programa', 'facultad', 'general']);
  });
});
