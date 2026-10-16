/**
 * Lo que mensajeria necesita saber de una cuenta: nombre y rol, leidos en el
 * servidor (nunca de lo que diga el cliente). Lo implementa la
 * infraestructura de `messaging` sobre el directorio y los roles de
 * `identity`, sin que el dominio de `messaging` importe nada de alla.
 */
export type MessagingRole = 'student' | 'professor' | 'other';

export interface DirectoryEntry {
  readonly email: string;
  readonly name: string;
  readonly role: MessagingRole;
  readonly program: string;
  readonly semester?: number;
}

export interface MessagingDirectoryPort {
  findByEmail(email: string): Promise<DirectoryEntry | null>;
  listStudents(): Promise<readonly DirectoryEntry[]>;
}
