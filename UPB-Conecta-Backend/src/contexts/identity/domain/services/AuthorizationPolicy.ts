import { Role } from '../value-objects/Role.js';

export type AuthorizationDecision = { readonly allowed: true } | { readonly allowed: false; readonly reason: string };

/**
 * Jerarquia minima, no una matriz de permisos: la historia solo pide
 * distinguir dos roles (criterio 4), y un administrador de contenido sigue
 * siendo una cuenta autenticada — puede hacer todo lo que un estudiante
 * puede. Si en el futuro aparece un tercer rol sin esa relacion de
 * contencion, esto deja de alcanzar y hay que modelar permisos explicitos
 * por operacion en vez de un rango total.
 */
const ROLE_RANK: Readonly<Record<Role, number>> = {
  [Role.STUDENT]: 0,
  [Role.CONTENT_ADMIN]: 1
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
