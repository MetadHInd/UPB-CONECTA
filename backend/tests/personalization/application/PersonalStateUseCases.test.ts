import { describe, it, expect } from 'vitest';
import { UpdatePersonalState } from '../../../src/contexts/personalization/application/UpdatePersonalState.js';
import { GetPersonalState } from '../../../src/contexts/personalization/application/GetPersonalState.js';
import { ListSavedConvocatorias } from '../../../src/contexts/personalization/application/ListSavedConvocatorias.js';
import { ListArchivedConvocatorias } from '../../../src/contexts/personalization/application/ListArchivedConvocatorias.js';
import { InMemoryPersonalStateRepository } from '../../../src/contexts/personalization/infrastructure/adapters/out/memory/InMemoryPersonalStateRepository.js';
import { FixedClock } from '../../../src/contexts/personalization/infrastructure/adapters/out/memory/SystemClock.js';

function buildUseCases(clock = new FixedClock(new Date('2026-01-01T10:00:00Z'))) {
  const repository = new InMemoryPersonalStateRepository();
  return {
    repository,
    clock,
    update: new UpdatePersonalState({ repository, clock }),
    get: new GetPersonalState({ repository, clock }),
    listSaved: new ListSavedConvocatorias({ repository }),
    listArchived: new ListArchivedConvocatorias({ repository })
  };
}

describe('Casos de uso de estado personal (HU-16)', () => {
  it('una convocatoria nunca marcada tiene los valores por defecto (todo en false)', async () => {
    const { get } = buildUseCases();
    const state = await get.execute({ studentId: 'est-1', convocatoriaId: 'conv-1' });
    expect(state).toEqual({
      studentId: 'est-1',
      convocatoriaId: 'conv-1',
      read: false,
      saved: false,
      archived: false,
      updatedAt: new Date('2026-01-01T10:00:00Z')
    });
  });

  it('criterio 1: marcar como leida persiste el estado y se refleja al volver a consultarlo', async () => {
    const { update, get } = buildUseCases();
    await update.execute({ studentId: 'est-1', convocatoriaId: 'conv-1', read: true });

    const state = await get.execute({ studentId: 'est-1', convocatoriaId: 'conv-1' });
    expect(state.read).toBe(true);
  });

  it('las banderas son independientes: archivar no le quita el guardado que ya tenia', async () => {
    const { update } = buildUseCases();
    await update.execute({ studentId: 'est-1', convocatoriaId: 'conv-1', saved: true });
    const actualizado = await update.execute({ studentId: 'est-1', convocatoriaId: 'conv-1', archived: true });

    expect(actualizado.saved).toBe(true);
    expect(actualizado.archived).toBe(true);
  });

  it('criterio 2: una convocatoria guardada aparece en la vista de guardados', async () => {
    const { update, listSaved } = buildUseCases();
    await update.execute({ studentId: 'est-1', convocatoriaId: 'conv-1', saved: true });
    await update.execute({ studentId: 'est-1', convocatoriaId: 'conv-2', saved: false });

    const guardadas = await listSaved.execute({ studentId: 'est-1' });
    expect(guardadas.map((s) => s.convocatoriaId)).toEqual(['conv-1']);
  });

  it('criterio 3: una convocatoria archivada sigue siendo recuperable en su propia vista', async () => {
    const { update, listArchived } = buildUseCases();
    await update.execute({ studentId: 'est-1', convocatoriaId: 'conv-1', archived: true });

    const archivadas = await listArchived.execute({ studentId: 'est-1' });
    expect(archivadas).toHaveLength(1);
    expect(archivadas[0]?.convocatoriaId).toBe('conv-1');
  });

  it('criterio 5: el estado de un estudiante es independiente del de otro sobre la misma convocatoria', async () => {
    const { update, get } = buildUseCases();
    await update.execute({ studentId: 'est-1', convocatoriaId: 'conv-1', read: true, saved: true });

    const otroEstudiante = await get.execute({ studentId: 'est-2', convocatoriaId: 'conv-1' });
    expect(otroEstudiante.read).toBe(false);
    expect(otroEstudiante.saved).toBe(false);
  });
});
