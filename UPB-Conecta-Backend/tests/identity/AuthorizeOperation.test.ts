import { describe, expect, it } from 'vitest';
import { AuthorizeOperation, UnknownProtectedOperationError } from '../../src/contexts/identity/application/AuthorizeOperation.js';
import { InMemoryAccountRoleRepository } from '../../src/contexts/identity/infrastructure/adapters/out/memory/InMemoryAccountRoleRepository.js';
import { InMemoryAuthorizationAuditLog } from '../../src/contexts/identity/infrastructure/adapters/out/memory/InMemoryAuthorizationAuditLog.js';
import { ManualClock } from '../../src/contexts/identity/infrastructure/adapters/out/memory/SessionClocks.js';
import { AuthorizationAuditEventKind } from '../../src/contexts/identity/domain/ports/out/AuthorizationAuditLogPort.js';
import { Role } from '../../src/contexts/identity/domain/value-objects/Role.js';
import type { ProtectedOperationsCatalog } from '../../src/contexts/identity/domain/ports/out/ProtectedOperationsCatalogPort.js';

const NOW = new Date('2026-09-23T12:00:00Z');
const CATALOG: ProtectedOperationsCatalog = {
  operations: [{ operation: 'ManageTopics', requiredRole: Role.CONTENT_ADMIN }]
};

function buildUseCase(catalog: ProtectedOperationsCatalog = CATALOG) {
  const roleRepo = new InMemoryAccountRoleRepository();
  const auditLog = new InMemoryAuthorizationAuditLog();
  const clock = new ManualClock(NOW);
  const useCase = new AuthorizeOperation({ catalog, roleRepo, auditLog, clock });
  return { useCase, roleRepo, auditLog, clock };
}

describe('AuthorizeOperation (HU-46)', () => {
  it('criterio 1: verifica el rol del solicitante en el servidor antes de autorizar una operacion administrativa', async () => {
    const { useCase, roleRepo } = buildUseCase();
    await roleRepo.save({ subject: 'admin@upb.edu.co', role: Role.CONTENT_ADMIN, assignedAt: NOW, assignedBy: 'seed' });

    const decision = await useCase.execute({ subject: 'admin@upb.edu.co', operation: 'ManageTopics', origin: '10.0.0.1' });

    expect(decision).toEqual({ allowed: true });
  });

  it('criterio 2: un estudiante que invoca directamente un punto de entrada administrativo se rechaza aunque la interfaz nunca se lo haya mostrado', async () => {
    const { useCase } = buildUseCase();
    // Sin registro de rol: por defecto es estudiante (criterio 4).

    const decision = await useCase.execute({ subject: 'estudiante@upb.edu.co', operation: 'ManageTopics', origin: '10.0.0.2' });

    expect(decision.allowed).toBe(false);
  });

  it('criterio 3: un intento no autorizado queda registrado con usuario, operacion, origen y marca de tiempo', async () => {
    const { useCase, auditLog } = buildUseCase();

    await useCase.execute({ subject: 'estudiante@upb.edu.co', operation: 'ManageTopics', origin: '10.0.0.2' });

    expect(auditLog.events).toEqual([
      {
        kind: AuthorizationAuditEventKind.UNAUTHORIZED_ATTEMPT,
        subject: 'estudiante@upb.edu.co',
        operation: 'ManageTopics',
        origin: '10.0.0.2',
        requiredRole: Role.CONTENT_ADMIN,
        actualRole: Role.STUDENT,
        occurredAt: NOW
      }
    ]);
  });

  it('un intento autorizado no queda registrado como intento no autorizado', async () => {
    const { useCase, roleRepo, auditLog } = buildUseCase();
    await roleRepo.save({ subject: 'admin@upb.edu.co', role: Role.CONTENT_ADMIN, assignedAt: NOW, assignedBy: 'seed' });

    await useCase.execute({ subject: 'admin@upb.edu.co', operation: 'ManageTopics', origin: '10.0.0.1' });

    expect(auditLog.events).toHaveLength(0);
  });

  it('una operacion que no esta en el catalogo se rechaza explicitamente (sin rol declarado, no se asume via libre)', async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({ subject: 'admin@upb.edu.co', operation: 'OperacionInexistente', origin: '10.0.0.1' })
    ).rejects.toBeInstanceOf(UnknownProtectedOperationError);
  });
});
