import type { IdentityProfile } from '../../../identity/domain/entities/IdentityProfile.js';
import type { AccountRoleRepositoryPort } from '../../../identity/domain/ports/out/AccountRoleRepositoryPort.js';
import { Role } from '../../../identity/domain/value-objects/Role.js';
import type { DirectoryEntry, MessagingDirectoryPort, MessagingRole } from '../../domain/ports/out/MessagingDirectoryPort.js';

/** Lo minimo que este adaptador necesita del directorio de cuentas de `identity`. */
export interface IdentityProfileSource {
  findProfile(email: string): Promise<IdentityProfile | null>;
  listProfiles(): Promise<readonly IdentityProfile[]>;
}

/**
 * Implementa el puerto de `messaging` sobre el directorio de cuentas y los
 * roles de `identity` (HU-46). Cruza el limite de contexto solo en
 * infraestructura, igual que `IdentityProfileSyncAdapter` en `profile`. El
 * rol se lee fresco en cada llamada: un cambio con `ChangeAccountRole` surte
 * efecto en la siguiente peticion.
 */
export class IdentityMessagingDirectoryAdapter implements MessagingDirectoryPort {
  constructor(
    private readonly dependencies: {
      readonly profiles: IdentityProfileSource;
      readonly roles: AccountRoleRepositoryPort;
    }
  ) {}

  async findByEmail(email: string): Promise<DirectoryEntry | null> {
    const profile = await this.dependencies.profiles.findProfile(email);
    return profile ? this.toEntry(profile) : null;
  }

  async listStudents(): Promise<readonly DirectoryEntry[]> {
    const profiles = await this.dependencies.profiles.listProfiles();
    const entries = await Promise.all(profiles.map((profile) => this.toEntry(profile)));
    return entries.filter((entry) => entry.role === 'student');
  }

  private async toEntry(profile: IdentityProfile): Promise<DirectoryEntry> {
    const email = profile.email.toLowerCase();
    const role = (await this.dependencies.roles.findBySubject(email))?.role ?? Role.STUDENT;
    return {
      email,
      name: profile.name,
      role: toMessagingRole(role),
      program: profile.program,
      ...(profile.semester !== undefined ? { semester: profile.semester } : {})
    };
  }
}

function toMessagingRole(role: Role): MessagingRole {
  switch (role) {
    case Role.STUDENT:
      return 'student';
    case Role.PROFESSOR:
      return 'professor';
    default:
      return 'other';
  }
}
