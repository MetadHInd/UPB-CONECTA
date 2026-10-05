import { describe, expect, it } from 'vitest';
import { ProgramTargetingResolver } from '../../src/contexts/targeting/domain/services/ProgramTargetingResolver.js';
import { FacultyProgramResolver } from '../../src/contexts/targeting/domain/services/FacultyProgramResolver.js';
import { allCommunityTargeting, facultyTargeting, programTargeting } from '../../src/contexts/targeting/domain/value-objects/ProgramTargeting.js';
import type { InstitutionalProgramCatalog } from '../../src/contexts/targeting/domain/ports/out/ProgramCatalogPort.js';
import { loadProgramCatalog } from '../../src/contexts/targeting/infrastructure/config/JsonProgramCatalogProvider.js';
import type { InstitutionalMessage } from '../../src/contexts/ingestion/domain/entities/InstitutionalMessage.js';
import { MessageId } from '../../src/contexts/ingestion/domain/value-objects/MessageId.js';

const catalog: InstitutionalProgramCatalog = {
  faculties: [
    { id: 'ingenieria', name: 'Facultad de Ingeniería', programIds: ['sistemas', 'industrial', 'electronica'] },
    { id: 'ciencias-administrativas', name: 'Facultad de Ciencias Administrativas', programIds: ['administracion', 'contaduria'] }
  ],
  programs: [
    { id: 'sistemas', name: 'Ingeniería de Sistemas', facultyId: 'ingenieria' },
    { id: 'industrial', name: 'Ingeniería Industrial', facultyId: 'ingenieria' },
    { id: 'electronica', name: 'Ingeniería Electrónica', facultyId: 'ingenieria' },
    { id: 'administracion', name: 'Administración de Empresas', facultyId: 'ciencias-administrativas' },
    { id: 'contaduria', name: 'Contaduría Pública', facultyId: 'ciencias-administrativas' }
  ]
};

const buildMessage = (overrides: Partial<InstitutionalMessage> = {}): InstitutionalMessage => ({
  messageId: MessageId.fromHeader('<msg-targeting-1@upb.edu.co>'),
  mailboxUid: 1,
  sender: 'oficina@upb.edu.co',
  subject: 'Convocatoria interna',
  sentAt: new Date('2026-09-11T08:00:00Z'),
  recipients: ['estudiantes@upb.edu.co'],
  body: 'Convocatoria para estudiantes de Ingenieria de Sistemas y Administración.',
  attachments: [],
  ...overrides
});

describe('HU-07 — segmentación de programas', () => {
  it('determina un conjunto explícito de programas destinatarios', () => {
    const resolver = new ProgramTargetingResolver(catalog);
    const targeting = resolver.resolveFromMessage(buildMessage());

    expect(targeting).toEqual(programTargeting(['sistemas', 'administracion']));
  });

  it('asigna toda la comunidad cuando no hay mención explícita de programa', () => {
    const resolver = new ProgramTargetingResolver(catalog);
    const targeting = resolver.resolveFromMessage(buildMessage({ body: 'Comunicado general para toda la comunidad.' }));

    expect(targeting).toEqual(allCommunityTargeting());
  });

  it('expande una facultad completa al conjunto de sus programas', () => {
    const resolver = new ProgramTargetingResolver(catalog);
    const targeting = resolver.resolveFromMessage(buildMessage({ body: 'Convocatoria dirigida a la Facultad de Ingeniería.' }));

    expect(targeting).toEqual(facultyTargeting('ingenieria'));
    expect(new FacultyProgramResolver(catalog).resolveFacultyPrograms('ingenieria')).toEqual([
      'sistemas',
      'industrial',
      'electronica'
    ]);
  });

  it('carga el catálogo institucional desde un archivo externo de configuración', async () => {
    const catalogFromFile = await loadProgramCatalog();

    expect(catalogFromFile.faculties.length).toBeGreaterThan(0);
    expect(catalogFromFile.programs.length).toBeGreaterThan(0);
  });

  it('muestra la segmentación exacta del catálogo para consultas directas de persistencia', async () => {
    const resolver = new ProgramTargetingResolver(catalog);
    const computed = resolver.resolveFromMessage(buildMessage({ body: 'Mensaje para Contaduría y Sistemas.' }));

    const persisted = {
      messageId: 'msg-targeting-2',
      targeting: computed,
      persistedAt: new Date('2026-09-12T10:00:00Z')
    };

    expect(persisted.targeting).toEqual(programTargeting(['sistemas', 'contaduria']));
  });
});
