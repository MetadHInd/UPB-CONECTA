export interface IdentityProfile {
  readonly name: string;
  readonly email: string;
  readonly program: string;
  readonly semester: number;
  readonly studentId?: string;
}
