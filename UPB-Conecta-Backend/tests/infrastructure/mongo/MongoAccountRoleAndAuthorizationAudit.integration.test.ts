import { MongoClient, type Db } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoAccountRoleRepository } from '../../../src/contexts/identity/infrastructure/adapters/out/mongo/MongoAccountRoleRepository.js';
import { MongoAuthorizationAuditLog } from '../../../src/contexts/identity/infrastructure/adapters/out/mongo/MongoAuthorizationAuditLog.js';
import { AuthorizationAuditEventKind } from '../../../src/contexts/identity/domain/ports/out/AuthorizationAuditLogPort.js';
import { Role } from '../../../src/contexts/identity/domain/value-objects/Role.js';

const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
const DATABASE = process.env['MONGODB_TEST_DATABASE'] ?? 'upb_conecta_test';
const ROLES_COLLECTION = 'account_roles_test';
const AUDIT_COLLECTION = 'authorization_audit_test';

describe('MongoAccountRoleRepository y MongoAuthorizationAuditLog (integración contra MongoDB real)', () => {
  let client: MongoClient;
  let db: Db;

  beforeAll(async () => {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DATABASE);
  });

  beforeEach(async () => {
    await db.collection(ROLES_COLLECTION).deleteMany({});
    await db.collection(AUDIT_COLLECTION).deleteMany({});
  });

  afterAll(async () => {
    await db.collection(ROLES_COLLECTION).drop().catch(() => undefined);
    await db.collection(AUDIT_COLLECTION).drop().catch(() => undefined);
    await client.close();
  });

  it('criterio 6: guarda el rol de una cuenta con upsert por subject (un cambio reemplaza, no acumula)', async () => {
    const repository = new MongoAccountRoleRepository(db, ROLES_COLLECTION);
    const assignedAt = new Date('2026-09-23T00:00:00Z');

    await repository.save({ subject: 's1', role: Role.STUDENT, assignedAt, assignedBy: 'seed' });
    await repository.save({ subject: 's1', role: Role.CONTENT_ADMIN, assignedAt, assignedBy: 'coordinador@upb.edu.co' });

    const record = await repository.findBySubject('s1');
    expect(record?.role).toBe(Role.CONTENT_ADMIN);
    expect(await db.collection(ROLES_COLLECTION).countDocuments()).toBe(1);
  });

  it('sin registro guardado, no existe rol (el llamador es quien decide el valor por defecto)', async () => {
    const repository = new MongoAccountRoleRepository(db, ROLES_COLLECTION);
    expect(await repository.findBySubject('nunca-registrado')).toBeNull();
  });

  it('criterios 3 y 6: el log de autorizacion es append-only', async () => {
    const auditLog = new MongoAuthorizationAuditLog(db, AUDIT_COLLECTION);

    await auditLog.record({
      kind: AuthorizationAuditEventKind.UNAUTHORIZED_ATTEMPT,
      subject: 's1',
      operation: 'ManageTopics',
      origin: '10.0.0.1',
      requiredRole: Role.CONTENT_ADMIN,
      actualRole: Role.STUDENT,
      occurredAt: new Date('2026-09-23T00:00:00Z')
    });
    await auditLog.record({
      kind: AuthorizationAuditEventKind.ROLE_CHANGED,
      subject: 's1',
      previousRole: Role.STUDENT,
      newRole: Role.CONTENT_ADMIN,
      changedBy: 'coordinador@upb.edu.co',
      occurredAt: new Date('2026-09-23T00:01:00Z')
    });

    const count = await db.collection(AUDIT_COLLECTION).countDocuments();
    expect(count).toBe(2);
  });
});
