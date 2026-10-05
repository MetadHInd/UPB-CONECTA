/**
 * HU-46, criterio 4: catalogo minimo de roles de cuenta. Dos roles porque son
 * los dos que la historia pide distinguir; agregar uno nuevo es agregar un
 * valor aqui, sin tocar la politica de autorizacion.
 */
export enum Role {
  STUDENT = 'student',
  CONTENT_ADMIN = 'content-admin'
}

export const ROLES: readonly Role[] = Object.values(Role);

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && ROLES.includes(value as Role);
}
