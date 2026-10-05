import { describe, it, expect } from 'vitest';
import { ProfileStudentDirectoryAdapter } from '../../../src/contexts/notifications/infrastructure/adapters/out/profile/ProfileStudentDirectoryAdapter.js';
import { InMemoryStudentProfileRepository } from '../../../src/contexts/profile/infrastructure/adapters/out/memory/InMemoryStudentProfileRepository.js';
import { StudentProfile } from '../../../src/contexts/profile/domain/entities/StudentProfile.js';
import { createSemesterBounds } from '../../../src/contexts/profile/domain/value-objects/SemesterNumber.js';

describe('ProfileStudentDirectoryAdapter (HU-19/HU-20): implementa StudentDirectoryPort leyendo profile', () => {
  it('proyecta cada perfil a { studentId, programId }, sin exponer el resto del perfil', async () => {
    const profiles = new InMemoryStudentProfileRepository();
    const bounds = createSemesterBounds(12);
    await profiles.save(StudentProfile.fromDirectory({ name: 'Ana', email: 'Ana@UPB.edu.co', program: 'sistemas', semester: 5 }, 'ing-sistemas', bounds, new Date()));
    await profiles.save(StudentProfile.fromDirectory({ name: 'Luis', email: 'luis@upb.edu.co', program: 'programa-no-reconocido', semester: 3 }, null, bounds, new Date()));

    const adapter = new ProfileStudentDirectoryAdapter(profiles);
    const students = await adapter.findAll();

    expect(students).toEqual(
      expect.arrayContaining([
        { studentId: 'ana@upb.edu.co', programId: 'ing-sistemas' },
        { studentId: 'luis@upb.edu.co', programId: null }
      ])
    );
    expect(students).toHaveLength(2);
  });

  it('sin perfiles guardados, devuelve una lista vacia', async () => {
    const adapter = new ProfileStudentDirectoryAdapter(new InMemoryStudentProfileRepository());
    expect(await adapter.findAll()).toEqual([]);
  });
});
