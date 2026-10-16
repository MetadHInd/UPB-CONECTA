/**
 * HU-46, criterio 4: catalogo de roles de cuenta. `professor` se agrego
 * despues de la historia para distinguir docentes de estudiantes en la app;
 * su lugar en la jerarquia lo fija `AuthorizationPolicy`.
 */
export enum Role {
  STUDENT = 'student',
  PROFESSOR = 'professor',
  CONTENT_ADMIN = 'content-admin'
}

export const ROLES: readonly Role[] = Object.values(Role);

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && ROLES.includes(value as Role);
}
