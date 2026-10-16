import { parseArgs } from 'node:util';
import { MongoClient } from 'mongodb';

import { ChangeAccountRole } from './contexts/identity/application/ChangeAccountRole.js';
import { isRole, Role } from './contexts/identity/domain/value-objects/Role.js';
import { MongoIdentityProviderAdapter } from './contexts/identity/infrastructure/adapters/out/mongo/MongoIdentityProviderAdapter.js';
import { MongoAccountRoleRepository } from './contexts/identity/infrastructure/adapters/out/mongo/MongoAccountRoleRepository.js';
import { MongoAuthorizationAuditLog } from './contexts/identity/infrastructure/adapters/out/mongo/MongoAuthorizationAuditLog.js';
import { assignRoleIfMissing } from './contexts/identity/infrastructure/seed/TestAccountSeeder.js';
import { SystemClock } from './infrastructure/shared/SystemClock.js';

/**
 * Crea (o actualiza) una cuenta en MongoDB:
 *
 *   npm run user:create -- --email juan.perez@upb.edu.co --password 'Clave123!' \
 *     --name 'Juan Pérez' --program 'Ingeniería de Sistemas' --semester 4 --student-id 2024-0100
 *
 *   npm run user:create -- --role professor --email maria.diaz@upb.edu.co --password 'Clave123!' \
 *     --name 'María Díaz' --program 'Ingeniería de Sistemas'
 *
 * `--role` es `student` (por defecto), `professor` o `content-admin`. El
 * semestre es obligatorio solo para estudiantes. Usa MONGODB_URI /
 * MONGODB_DATABASE igual que el servidor HTTP. Si la cuenta ya existia,
 * reemplaza contrasena y perfil; su rol solo cambia si se pasa `--role`
 * explicitamente, y ese cambio queda auditado (HU-46, criterio 6).
 */
async function main(): Promise<void> {
  // En local lee .env si existe; en Railway las variables ya vienen inyectadas.
  try {
    process.loadEnvFile();
  } catch {
    // sin .env: se usan las variables del entorno
  }

  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      password: { type: 'string' },
      name: { type: 'string' },
      program: { type: 'string' },
      semester: { type: 'string' },
      'student-id': { type: 'string' },
      role: { type: 'string' }
    }
  });

  const { email, password, name, program } = values;
  const roleArg = values.role;
  if (roleArg !== undefined && !isRole(roleArg)) {
    throw new Error(`--role debe ser uno de: ${Object.values(Role).join(', ')}`);
  }
  const role = roleArg ?? Role.STUDENT;
  const semester = values.semester === undefined ? undefined : Number(values.semester);
  const semesterValid = semester === undefined ? role !== Role.STUDENT : Number.isInteger(semester) && semester >= 1;
  if (!email || !password || !name || !program || !semesterValid) {
    throw new Error(
      'Uso: --email --password --name --program [--role student|professor|content-admin] ' +
        '[--semester <entero>, obligatorio para estudiantes] [--student-id]'
    );
  }

  const client = new MongoClient(process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017');
  await client.connect();
  try {
    const db = client.db(process.env['MONGODB_DATABASE'] ?? 'upb_conecta');
    const normalizedEmail = email.trim().toLowerCase();
    const studentId = values['student-id'];

    await new MongoIdentityProviderAdapter(db).register({
      username: normalizedEmail,
      password,
      profile: {
        name,
        email: normalizedEmail,
        program,
        ...(semester !== undefined ? { semester } : {}),
        ...(studentId ? { studentId } : {})
      }
    });

    const roles = new MongoAccountRoleRepository(db);
    const current = await roles.findBySubject(normalizedEmail);
    if (current === null) {
      await assignRoleIfMissing(roles, normalizedEmail, role, 'cli');
    } else if (roleArg !== undefined && current.role !== role) {
      await new ChangeAccountRole({ roleRepo: roles, auditLog: new MongoAuthorizationAuditLog(db), clock: new SystemClock() }).execute({
        subject: normalizedEmail,
        newRole: role,
        changedBy: 'cli'
      });
    }

    const finalRole = (await roles.findBySubject(normalizedEmail))?.role ?? Role.STUDENT;
    console.log(`Cuenta ${normalizedEmail} lista (rol: ${finalRole}).`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
