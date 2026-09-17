import type {
  IdentityCredentials,
  IdentityProfile,
  IdentityProviderPort
} from '../../../../domain/ports/out/IdentityProviderPort.js';
import { ProviderUnavailableError } from '../../../../application/AuthenticateStudent.js';

export class RealIdentityProviderAdapter implements IdentityProviderPort {
  async authenticate(_credentials: IdentityCredentials): Promise<IdentityProfile> {
    throw new ProviderUnavailableError(
      'El directorio institucional real aún no está configurado para este entorno. Se debe conectar con LDAP/OAuth o un proveedor institucional válido.'
    );
  }
}
