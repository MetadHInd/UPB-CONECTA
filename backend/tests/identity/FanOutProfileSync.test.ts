import { describe, expect, it } from 'vitest';
import type { IdentityProfile } from '../../src/contexts/identity/domain/entities/IdentityProfile.js';
import { FanOutProfileSync } from '../../src/contexts/identity/infrastructure/adapters/out/profile-sync/FanOutProfileSync.js';

const PROFILE: IdentityProfile = { name: 'Ana', email: 'ana@upb.edu.co', program: 'Sistemas', semester: 5 };

describe('FanOutProfileSync — un login sincroniza varios contextos (HU-37 + HU-30)', () => {
  it('entrega el perfil del directorio a cada destino, en orden', async () => {
    const calls: string[] = [];
    const sync = new FanOutProfileSync([
      { syncFromDirectory: async (p) => void calls.push(`perfil:${p.email}`) },
      { syncFromDirectory: async (p) => void calls.push(`foro:${p.email}`) }
    ]);

    await sync.syncFromDirectory(PROFILE);

    expect(calls).toEqual(['perfil:ana@upb.edu.co', 'foro:ana@upb.edu.co']);
  });

  it('si un destino falla, propaga el error y no sigue con los demás', async () => {
    const calls: string[] = [];
    const sync = new FanOutProfileSync([
      { syncFromDirectory: async () => { throw new Error('Mongo no disponible'); } },
      { syncFromDirectory: async () => void calls.push('foro') }
    ]);

    await expect(sync.syncFromDirectory(PROFILE)).rejects.toThrow('Mongo no disponible');
    expect(calls).toEqual([]);
  });
});
