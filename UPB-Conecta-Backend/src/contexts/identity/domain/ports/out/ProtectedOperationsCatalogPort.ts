import { isRole, type Role } from '../../value-objects/Role.js';

/**
 * HU-46, criterio 4: "el dominio expone que rol requiere cada caso de uso"
 * (diseno de la historia en Jira). Este catalogo es esa declaracion
 * explicita — una operacion que no aparece aqui simplemente no tiene rol
 * declarado, y el analisis de seguridad (criterio 5,
 * `scripts/check-declared-authorization.mjs`) puede detectarlo como
 * hallazgo antes del despliegue.
 */
export interface ProtectedOperationEntry {
  /** Nombre de la clase de caso de uso, tal como aparece en `export class X`. */
  readonly operation: string;
  readonly requiredRole: Role;
}

export interface ProtectedOperationsCatalog {
  readonly operations: readonly ProtectedOperationEntry[];
}

export function requiredRoleFor(catalog: ProtectedOperationsCatalog, operation: string): Role | null {
  return catalog.operations.find((entry) => entry.operation === operation)?.requiredRole ?? null;
}

export function isValidProtectedOperationsCatalog(value: unknown): value is ProtectedOperationsCatalog {
  if (typeof value !== 'object' || value === null || !Array.isArray((value as ProtectedOperationsCatalog).operations)) {
    return false;
  }
  return (value as ProtectedOperationsCatalog).operations.every(
    (entry) => typeof entry.operation === 'string' && entry.operation.length > 0 && isRole(entry.requiredRole)
  );
}
