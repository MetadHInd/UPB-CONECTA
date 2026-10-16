import { MongoClient, type Db } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoIdentityProviderAdapter } from '../../../src/contexts/identity/infrastructure/adapters/out/mongo/MongoIdentityProviderAdapter.js';
import { MongoAccountRoleRepository } from '../../../src/contexts/identity/infrastructure/adapters/out/mongo/MongoAccountRoleRepository.js';
import { seedTestAccounts, TEST_ACCOUNTS } from '../../../src/contexts/identity/infrastructure/seed/TestAccountSeeder.js';
import { InvalidCredentialsError } from '../../../src/contexts/identity/application/AuthenticateStudent.js';
import { Role } from '../../../src/contexts/identity/domain/value-objects/Role.js';

const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
const DATABASE = process.env['MONGODB_TEST_DATABASE'] ?? 'upb_conecta_test';
const USERS_COLLECTION = 'identity_users_test';
const ROLES_COLLECTION = 'identity_account_roles_users_test';

const ACCOUNT = {
  username: 'Juan.Perez@upb.edu.co',
  password: 'Clave123!',
  profile: { name: 'Juan Pérez', email: 'Juan.Perez@upb.edu.co', program: 'Ingeniería de Sistemas', semester: 4, studentId: '2024-0100' }
};

describe('MongoIdentityProviderAdapter (integración contra MongoDB real)', () => {
  let client: MongoClient;
  let db: Db;
  let users: MongoIdentityProviderAdapter;
  let roles: MongoAccountRoleRepository;

  beforeAll(async () => {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DATABASE);
  });

  beforeEach(async () => {
    await db.collection(USERS_COLLECTION).deleteMany({});
    await db.collection(ROLES_COLLECTION).deleteMany({});
    users = new MongoIdentityProviderAdapter(db, USERS_COLLECTION);
    roles = new MongoAccountRoleRepository(db, ROLES_COLLECTION);
  });

  afterAll(async () => {
    await db.collection(USERS_COLLECTION).drop().catch(() => undefined);
    await db.collection(ROLES_COLLECTION).drop().catch(() => undefined);
    await client.close();
  });

  it('autentica una cuenta registrada sin importar mayusculas ni espacios en el usuario', async () => {
    await users.register(ACCOUNT);

    const profile = await users.authenticate({ username: '  juan.perez@UPB.edu.co ', password: 'Clave123!', origin: 'test' });

    expect(profile).toEqual({ ...ACCOUNT.profile, email: 'juan.perez@upb.edu.co' });
  });

  it('rechaza contrasena incorrecta y usuario inexistente con el mismo error generico', async () => {
    await users.register(ACCOUNT);

    await expect(users.authenticate({ username: ACCOUNT.username, password: 'otra', origin: 'test' })).rejects.toBeInstanceOf(InvalidCredentialsError);
    await expect(users.authenticate({ username: 'nadie@upb.edu.co', password: 'Clave123!', origin: 'test' })).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('nunca guarda la contrasena en claro', async () => {
    await users.register(ACCOUNT);

    const stored = await db.collection(USERS_COLLECTION).findOne({ _id: 'juan.perez@upb.edu.co' as never });
    expect(JSON.stringify(stored)).not.toContain('Clave123!');
    expect(stored?.['passwordHash']).toMatch(/^scrypt\$[0-9a-f]+\$[0-9a-f]+$/);
  });

  it('register reemplaza la contrasena; registerIfAbsent no toca una cuenta existente', async () => {
    await users.register(ACCOUNT);
    await users.register({ ...ACCOUNT, password: 'Nueva456!' });
    expect(await users.registerIfAbsent({ ...ACCOUNT, password: 'Ignorada789!' })).toBe(false);

    await expect(users.authenticate({ username: ACCOUNT.username, password: 'Nueva456!', origin: 'test' })).resolves.toBeDefined();
    await expect(users.authenticate({ username: ACCOUNT.username, password: 'Ignorada789!', origin: 'test' })).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('el seed crea estudiantes y profesores con su rol y es idempotente sin cambiar roles asignados', async () => {
    const first = await seedTestAccounts(users, roles);
    expect(first.created).toHaveLength(TEST_ACCOUNTS.length);

    await roles.save({ subject: 'carlos.ramirez@upb.edu.co', role: Role.CONTENT_ADMIN, assignedAt: new Date(), assignedBy: 'coordinador@upb.edu.co' });
    const second = await seedTestAccounts(users, roles);

    expect(second.created).toHaveLength(0);
    expect(second.existing).toHaveLength(TEST_ACCOUNTS.length);
    expect((await roles.findBySubject('estudiante@upb.edu.co'))?.role).toBe(Role.STUDENT);
    expect((await roles.findBySubject('profesor@upb.edu.co'))?.role).toBe(Role.PROFESSOR);
    expect((await roles.findBySubject('carlos.ramirez@upb.edu.co'))?.role).toBe(Role.CONTENT_ADMIN);
    await expect(users.authenticate({ username: 'laura.martinez@upb.edu.co', password: 'S3cr3t!UPB', origin: 'test' })).resolves.toMatchObject({
      program: 'Ingeniería Industrial',
      semester: 7
    });
  });

  it('un profesor se autentica sin semestre', async () => {
    await seedTestAccounts(users, roles);

    const profile = await users.authenticate({ username: 'profesor@upb.edu.co', password: 'S3cr3t!UPB', origin: 'test' });

    expect(profile).toEqual({ name: 'Ricardo Méndez', email: 'profesor@upb.edu.co', program: 'Ingeniería de Sistemas' });
  });
});
