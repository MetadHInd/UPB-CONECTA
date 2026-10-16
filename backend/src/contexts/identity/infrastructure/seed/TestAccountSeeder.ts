import type { AccountRoleRepositoryPort } from '../../domain/ports/out/AccountRoleRepositoryPort.js';
import { Role } from '../../domain/value-objects/Role.js';
import type { IdentityAccount, MongoIdentityProviderAdapter } from '../adapters/out/mongo/MongoIdentityProviderAdapter.js';

export interface TestAccount extends IdentityAccount {
  readonly role: Role;
}

/**
 * Cuentas de prueba que se crean en MongoDB al arrancar el servidor HTTP (si
 * no existen). Los programas son los de `config/program-catalog.json`; para
 * un profesor, `program` es el programa al que esta adscrito y no lleva
 * semestre. Todas comparten la contrasena de la cuenta historica de prueba
 * para que el equipo de Android no tenga que recordar varias.
 */
const TEST_PASSWORD = 'S3cr3t!UPB';

export const TEST_ACCOUNTS: readonly TestAccount[] = [
  student('estudiante@upb.edu.co', 'Ana Gómez', 'Ingeniería de Sistemas', 5, '2024-0001'),
  student('carlos.ramirez@upb.edu.co', 'Carlos Ramírez', 'Ingeniería de Sistemas', 3, '2024-0002'),
  student('laura.martinez@upb.edu.co', 'Laura Martínez', 'Ingeniería Industrial', 7, '2024-0003'),
  student('andres.lopez@upb.edu.co', 'Andrés López', 'Ingeniería Electrónica', 2, '2024-0004'),
  student('valentina.rojas@upb.edu.co', 'Valentina Rojas', 'Administración de Empresas', 4, '2024-0005'),
  student('santiago.herrera@upb.edu.co', 'Santiago Herrera', 'Contaduría Pública', 6, '2024-0006'),
  student('camila.torres@upb.edu.co', 'Camila Torres', 'Psicología', 8, '2024-0007'),
  student('mateo.castro@upb.edu.co', 'Mateo Castro', 'Periodismo', 1, '2024-0008'),
  student('daniela.moreno@upb.edu.co', 'Daniela Moreno', 'Ingeniería de Sistemas', 9, '2024-0009'),
  student('julian.vargas@upb.edu.co', 'Julián Vargas', 'Ingeniería Industrial', 10, '2024-0010'),
  professor('profesor@upb.edu.co', 'Ricardo Méndez', 'Ingeniería de Sistemas'),
  professor('patricia.suarez@upb.edu.co', 'Patricia Suárez', 'Ingeniería Industrial'),
  professor('jorge.navarro@upb.edu.co', 'Jorge Navarro', 'Psicología')
];

function student(email: string, name: string, program: string, semester: number, studentId: string): TestAccount {
  return { username: email, password: TEST_PASSWORD, role: Role.STUDENT, profile: { name, email, program, semester, studentId } };
}

function professor(email: string, name: string, program: string): TestAccount {
  return { username: email, password: TEST_PASSWORD, role: Role.PROFESSOR, profile: { name, email, program } };
}

export interface SeedReport {
  readonly created: readonly string[];
  readonly existing: readonly string[];
}

/**
 * Crea las cuentas que falten y les asigna su rol en
 * `AccountRoleRepositoryPort`. Idempotente: no toca cuentas existentes ni
 * cambia un rol ya asignado (por ejemplo, con `ChangeAccountRole`).
 */
export async function seedTestAccounts(
  users: MongoIdentityProviderAdapter,
  roles: AccountRoleRepositoryPort,
  accounts: readonly TestAccount[] = TEST_ACCOUNTS
): Promise<SeedReport> {
  const created: string[] = [];
  const existing: string[] = [];

  for (const account of accounts) {
    const wasCreated = await users.registerIfAbsent(account);
    (wasCreated ? created : existing).push(account.profile.email.toLowerCase());
    await assignRoleIfMissing(roles, account.profile.email, account.role, 'seed');
  }

  return { created, existing };
}

export async function assignRoleIfMissing(
  roles: AccountRoleRepositoryPort,
  email: string,
  role: Role,
  assignedBy: string
): Promise<void> {
  const subject = email.trim().toLowerCase();
  if (await roles.findBySubject(subject)) return;
  await roles.save({ subject, role, assignedAt: new Date(), assignedBy });
}
