import { describe, expect, it } from 'vitest';
import type { SyncStudentProfileFromDirectory } from '../../src/contexts/profile/application/SyncStudentProfileFromDirectory.js';
import type { DirectoryRecord } from '../../src/contexts/profile/domain/entities/StudentProfile.js';
import { IdentityProfileSyncAdapter } from '../../src/contexts/profile/infrastructure/integration/IdentityProfileSyncAdapter.js';

function recordingSync() {
  const calls: DirectoryRecord[] = [];
  const sync = {
    async execute(record: DirectoryRecord) {
      calls.push(record);
    }
  } as unknown as SyncStudentProfileFromDirectory;
  return { calls, sync };
}

describe('IdentityProfileSyncAdapter', () => {
  it('sincroniza el perfil de un estudiante (con semestre)', async () => {
    const { calls, sync } = recordingSync();

    await new IdentityProfileSyncAdapter(sync).syncFromDirectory({
      name: 'Ana Gómez',
      email: 'estudiante@upb.edu.co',
      program: 'Ingeniería de Sistemas',
      semester: 5,
      studentId: '2024-0001'
    });

    expect(calls).toEqual([{ name: 'Ana Gómez', email: 'estudiante@upb.edu.co', program: 'Ingeniería de Sistemas', semester: 5 }]);
  });

  it('no crea perfil de estudiante para un profesor (sin semestre)', async () => {
    const { calls, sync } = recordingSync();

    await new IdentityProfileSyncAdapter(sync).syncFromDirectory({
      name: 'Ricardo Méndez',
      email: 'profesor@upb.edu.co',
      program: 'Ingeniería de Sistemas'
    });

    expect(calls).toEqual([]);
  });
});
