import { describe, expect, it } from 'vitest';
import { authorize } from '../../src/contexts/identity/domain/services/AuthorizationPolicy.js';
import { Role } from '../../src/contexts/identity/domain/value-objects/Role.js';

describe('AuthorizationPolicy (HU-46, criterios 1 y 2)', () => {
  it('criterio 1: una cuenta con el rol exacto requerido queda autorizada', () => {
    expect(authorize(Role.CONTENT_ADMIN, Role.CONTENT_ADMIN)).toEqual({ allowed: true });
  });

  it('criterio 2: un estudiante que invoca una operacion de administrador de contenido se rechaza', () => {
    const decision = authorize(Role.STUDENT, Role.CONTENT_ADMIN);
    expect(decision.allowed).toBe(false);
    expect(decision.allowed === false && decision.reason).toContain('content-admin');
  });

  it('un administrador de contenido tambien puede hacer lo que puede hacer un estudiante', () => {
    expect(authorize(Role.CONTENT_ADMIN, Role.STUDENT)).toEqual({ allowed: true });
  });

  it('un estudiante puede hacer lo que requiere el rol de estudiante', () => {
    expect(authorize(Role.STUDENT, Role.STUDENT)).toEqual({ allowed: true });
  });
});
