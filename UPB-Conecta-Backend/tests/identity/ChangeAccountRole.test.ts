import { describe, expect, it } from 'vitest';
import { ChangeAccountRole } from '../../src/contexts/identity/application/ChangeAccountRole.js';
import { AuthorizeOperation } from '../../src/contexts/identity/application/AuthorizeOperation.js';
import { InMemoryAccountRoleRepository } from '../../src/contexts/identity/infrastructure/adapters/out/memory/InMemoryAccountRoleRepository.js';
import { InMemoryAuthorizationAuditLog } from '../../src/contexts/identity/infrastructure/adapters/out/memory/InMemoryAuthorizationAuditLog.js';
import { ManualClock } from '../../src/contexts/identity/infrastructure/adapters/out/memory/SessionClocks.js';
import { AuthorizationAuditEventKind } from '../../src/contexts/identity/domain/ports/out/AuthorizationAuditLogPort.js';
import { Role } from '../../src/contexts/identity/domain/value-objects/Role.js';
import type { ProtectedOperationsCatalog } from '../../src/contexts/identity/domain/ports/out/ProtectedOperationsCatalogPort.js';

const CATALOG: ProtectedOperationsCatalog = {
  operations: [{ operation: 'ManageTopics', requiredRole: Role.CONTENT_ADMIN }]
};

describe('ChangeAccountRole (HU-46, criterio 6)', () => {
  it('promueve una cuenta y queda auditado con el rol anterior y el nuevo', async () => {
    const roleRepo = new InMemoryAccountRoleRepository();
    const auditLog = new InMemoryAuthorizationAuditLog();
    const clock = new ManualClock(new Date('2026-09-23T12:00:00Z'));
    const changeRole = new ChangeAccountRole({ roleRepo, auditLog, clock });

    await changeRole.execute({ subject: 'nuevo-admin@upb.edu.co', newRole: Role.CONTENT_ADMIN, changedBy: 'coordinador@upb.edu.co' });

    const record = await roleRepo.findBySubject('nuevo-admin@upb.edu.co');
    expect(record?.role).toBe(Role.CONTENT_ADMIN);
    expect(auditLog.events).toEqual([
      {
        kind: AuthorizationAuditEventKind.ROLE_CHANGED,
        subject: 'nuevo-admin@upb.edu.co',
        previousRole: null,
        newRole: Role.CONTENT_ADMIN,
        changedBy: 'coordinador@upb.edu.co',
        occurredAt: clock.now()
      }
    ]);
  });

  it('el cambio surte efecto en la siguiente peticion: AuthorizeOperation lee el rol fresco, sin cache', async () => {
    const roleRepo = new InMemoryAccountRoleRepository();
    const auditLog = new InMemoryAuthorizationAuditLog();
    const clock = new ManualClock(new Date('2026-09-23T12:00:00Z'));
    const changeRole = new ChangeAccountRole({ roleRepo, auditLog, clock });
    const authorizeOperation = new AuthorizeOperation({ catalog: CATALOG, roleRepo, auditLog, clock });
    const subject = 'promovido@upb.edu.co';

    const before = await authorizeOperation.execute({ subject, operation: 'ManageTopics', origin: '10.0.0.1' });
    expect(before.allowed).toBe(false);

    await changeRole.execute({ subject, newRole: Role.CONTENT_ADMIN, changedBy: 'coordinador@upb.edu.co' });

    const after = await authorizeOperation.execute({ subject, operation: 'ManageTopics', origin: '10.0.0.1' });
    expect(after.allowed).toBe(true);
  });

  it('degradar una cuenta de content-admin a student conserva el rol anterior en la auditoria', async () => {
    const roleRepo = new InMemoryAccountRoleRepository();
    const auditLog = new InMemoryAuthorizationAuditLog();
    const clock = new ManualClock(new Date('2026-09-23T12:00:00Z'));
    const changeRole = new ChangeAccountRole({ roleRepo, auditLog, clock });
    await roleRepo.save({ subject: 's1', role: Role.CONTENT_ADMIN, assignedAt: clock.now(), assignedBy: 'seed' });

    await changeRole.execute({ subject: 's1', newRole: Role.STUDENT, changedBy: 'coordinador@upb.edu.co' });

    const lastEvent = auditLog.events.at(-1);
    expect(lastEvent).toMatchObject({ previousRole: Role.CONTENT_ADMIN, newRole: Role.STUDENT });
  });
});
