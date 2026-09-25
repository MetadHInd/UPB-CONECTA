import { PublicSafeValidationError } from '../errors/PublicSafeValidationError.js';

export type FieldType = 'string' | 'number' | 'boolean';

/**
 * HU-47, criterios 3 y 4: esquema declarativo minimo para validar la forma
 * de una entrada externa antes de que llegue al dominio. Deliberadamente
 * pequeno (tipo, requerido, longitud maxima, patron) — no es un reemplazo de
 * una libreria de validacion completa (zod, ajv), sino el contrato minimo
 * que hoy necesitan los puntos de entrada de este backend. Si en el futuro
 * hace falta algo mas expresivo (objetos anidados, arreglos), conviene
 * adoptar una libreria en vez de seguir creciendo esto a mano.
 */
export interface FieldSchema {
  readonly field: string;
  readonly type: FieldType;
  readonly required?: boolean;
  readonly maxLength?: number;
  readonly pattern?: RegExp;
}

export type SchemaValidationResult = { readonly valid: true } | { readonly valid: false; readonly error: PublicSafeValidationError };

/**
 * Valida `body` contra `schema` y devuelve el primer campo que falla, nunca
 * una lista de detalles internos. Un campo desconocido en `body` (no
 * declarado en `schema`) tambien se rechaza — el mismo criterio que ya
 * aplica `classifyPostBody` en `forum` (HU-30): el servidor decide que
 * campos admite, no los ignora en silencio.
 */
export function validateAgainstSchema(body: Readonly<Record<string, unknown>>, schema: readonly FieldSchema[]): SchemaValidationResult {
  const declaredFields = new Set(schema.map((entry) => entry.field));
  const unknownField = Object.keys(body).find((key) => !declaredFields.has(key));
  if (unknownField) {
    return { valid: false, error: new PublicSafeValidationError('La solicitud incluye un campo no admitido.', unknownField) };
  }

  for (const entry of schema) {
    const value = body[entry.field];
    const missing = value === undefined || value === null;

    if (missing) {
      if (entry.required !== false) {
        return { valid: false, error: new PublicSafeValidationError(`El campo '${entry.field}' es obligatorio.`, entry.field) };
      }
      continue;
    }

    if (typeof value !== entry.type) {
      return {
        valid: false,
        error: new PublicSafeValidationError(`El campo '${entry.field}' tiene un tipo invalido.`, entry.field)
      };
    }

    if (entry.type === 'string' && entry.maxLength !== undefined && (value as string).length > entry.maxLength) {
      return {
        valid: false,
        error: new PublicSafeValidationError(`El campo '${entry.field}' supera la longitud maxima permitida.`, entry.field)
      };
    }

    if (entry.type === 'string' && entry.pattern && !entry.pattern.test(value as string)) {
      return { valid: false, error: new PublicSafeValidationError(`El campo '${entry.field}' tiene un formato invalido.`, entry.field) };
    }
  }

  return { valid: true };
}
