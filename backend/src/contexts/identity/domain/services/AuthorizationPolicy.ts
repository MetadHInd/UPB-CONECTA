import { Role } from '../value-objects/Role.js';

export type AuthorizationDecision = { readonly allowed: true } | { readonly allowed: false; readonly reason: string };

/**
 * Jerarquia total, no una matriz de permisos: estudiante < profesor <
 * administrador de contenido. Un profesor puede todo lo que puede un
 * estudiante, y un administrador todo lo que puede un profesor. Si en el
 * futuro aparece un rol sin esa relacion de contencion, esto deja de
 * alcanzar y hay que modelar permisos explicitos por operacion en vez de un
 * rango total.
 */
const ROLE_RANK: Readonly<Record<Role, number>> = {
  [Role.STUDENT]: 0,
  [Role.PROFESSOR]: 1,
  [Role.CONTENT_ADMIN]: 2
};

/**
 * HU-46, criterios 1 y 2: politica de dominio pura, sin I/O — el mismo
 * estilo que `decidePublicationStatus` (HU-10) y `authorize(...)` no sabe
 * nada de sesiones, tokens ni HTTP.
 */
export function authorize(actualRole: Role, requiredRole: Role): AuthorizationDecision {
  if (ROLE_RANK[actualRole] >= ROLE_RANK[requiredRole]) {
    return { allowed: true };
  }
  return { allowed: false, reason: `Se requiere el rol '${requiredRole}'; la cuenta tiene '${actualRole}'.` };
}
