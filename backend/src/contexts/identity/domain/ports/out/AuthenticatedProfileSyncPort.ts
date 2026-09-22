import type { IdentityProfile } from '../../entities/IdentityProfile.js';

/**
 * Puerto de salida que `AuthenticateStudent` invoca tras cada autenticacion
 * correcta con los datos frescos del directorio (HU-37). Lo implementa el
 * contexto `profile` en su infraestructura; asi `identity` no depende de
 * `profile` y la sincronizacion no queda en manos de quien llame al login.
 */
export interface AuthenticatedProfileSyncPort {
  syncFromDirectory(profile: IdentityProfile): Promise<void>;
}
