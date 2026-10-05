export interface IdentityCredentials {
  readonly username: string;
  readonly password: string;
  readonly origin: string;
}

export interface IdentityProfile {
  readonly name: string;
  readonly email: string;
  readonly program: string;
  readonly semester: number;
  readonly studentId?: string;
}

export interface IdentityProviderPort {
  authenticate(credentials: IdentityCredentials): Promise<IdentityProfile>;
}
