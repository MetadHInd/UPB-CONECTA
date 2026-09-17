import { createHash } from 'node:crypto';

import type {
  IdentityCredentials,
  IdentityProfile,
  IdentityProviderPort
} from '../../../../domain/ports/out/IdentityProviderPort.js';
import { InvalidCredentialsError, ProviderUnavailableError } from '../../../../application/AuthenticateStudent.js';

export interface InMemoryIdentityAccount {
  readonly username: string;
  readonly password: string;
  readonly profile: IdentityProfile;
}

const DEFAULT_IDENTITY_ACCOUNTS: readonly InMemoryIdentityAccount[] = [
  {
    username: 'estudiante@upb.edu.co',
    password: 'S3cr3t!UPB',
    profile: {
      name: 'Ana Gómez',
      email: 'estudiante@upb.edu.co',
      program: 'Ingeniería de Sistemas',
      semester: 5,
      studentId: '2024-0001'
    }
  }
];

export class InMemoryIdentityProviderAdapter implements IdentityProviderPort {
  private readonly directory = new Map<string, { passwordHash: string; profile: IdentityProfile }>();

  constructor(accounts: readonly InMemoryIdentityAccount[] = DEFAULT_IDENTITY_ACCOUNTS) {
    for (const account of accounts) {
      this.directory.set(account.username.trim().toLowerCase(), {
        passwordHash: hashPassword(account.password),
        profile: account.profile
      });
    }
  }

  async authenticate(credentials: IdentityCredentials): Promise<IdentityProfile> {
    const username = credentials.username.trim().toLowerCase();
    const account = this.directory.get(username);

    if (!account) {
      throw new InvalidCredentialsError();
    }

    const providedHash = hashPassword(credentials.password);
    if (providedHash !== account.passwordHash) {
      throw new InvalidCredentialsError();
    }

    return {
      ...account.profile,
      email: account.profile.email.toLowerCase()
    };
  }

  register(account: InMemoryIdentityAccount): void {
    this.directory.set(account.username.trim().toLowerCase(), {
      passwordHash: hashPassword(account.password),
      profile: account.profile
    });
  }

  markUnavailable(): void {
    throw new ProviderUnavailableError();
  }
}

function hashPassword(password: string): string {
  return createHash('sha256').update(`upb-identity:${password}`).digest('hex');
}
