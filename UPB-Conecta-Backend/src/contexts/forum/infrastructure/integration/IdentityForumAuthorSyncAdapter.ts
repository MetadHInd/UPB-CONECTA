import type { IdentityProfile } from '../../../identity/domain/entities/IdentityProfile.js';
import type { AuthenticatedProfileSyncPort } from '../../../identity/domain/ports/out/AuthenticatedProfileSyncPort.js';
import type { SyncForumAuthor } from '../../application/SyncForumAuthor.js';

/**
 * Conecta el puerto de salida de `identity` (el mismo que usa `profile` desde
 * HU-37) con el foro: cada autenticacion correcta refresca el autor verificado.
 * `identity` no importa nada del foro.
 */
export class IdentityForumAuthorSyncAdapter implements AuthenticatedProfileSyncPort {
  constructor(private readonly sync: SyncForumAuthor) {}

  async syncFromDirectory(profile: IdentityProfile): Promise<void> {
    await this.sync.execute({ name: profile.name, email: profile.email, program: profile.program });
  }
}
