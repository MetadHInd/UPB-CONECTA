import type { IdentityProfile } from '../../../../domain/entities/IdentityProfile.js';
import type { AuthenticatedProfileSyncPort } from '../../../../domain/ports/out/AuthenticatedProfileSyncPort.js';

/**
 * `AuthenticateStudent` recibe un solo `profileSync`; varios contextos
 * necesitan los datos del directorio en cada login (`profile` desde HU-37,
 * `forum` desde HU-30). Este adaptador los invoca en orden. Si uno falla, el
 * error se propaga y el login falla, igual que con un unico destino: un
 * perfil o un autor desactualizado no deben quedar en silencio.
 */
export class FanOutProfileSync implements AuthenticatedProfileSyncPort {
  constructor(private readonly targets: readonly AuthenticatedProfileSyncPort[]) {}

  async syncFromDirectory(profile: IdentityProfile): Promise<void> {
    for (const target of this.targets) {
      await target.syncFromDirectory(profile);
    }
  }
}
