import { describe, expect, it } from 'vitest';
import { validateAgainstSchema, type FieldSchema } from '../../src/contexts/hardening/domain/services/SchemaValidation.js';
import { PublicSafeValidationError } from '../../src/contexts/hardening/domain/errors/PublicSafeValidationError.js';

const SCHEMA: readonly FieldSchema[] = [
  { field: 'title', type: 'string', required: true, maxLength: 10 },
  { field: 'active', type: 'boolean', required: false }
];

describe('validateAgainstSchema (HU-47, criterios 3 y 4)', () => {
  it('criterio 3: acepta un cuerpo que cumple el esquema declarado', () => {
    expect(validateAgainstSchema({ title: 'Hola' }, SCHEMA)).toEqual({ valid: true });
  });

  it('criterio 3: rechaza un campo obligatorio ausente', () => {
    const result = validateAgainstSchema({}, SCHEMA);
    expect(result.valid).toBe(false);
    expect(!result.valid && result.error).toBeInstanceOf(PublicSafeValidationError);
  });

  it('criterio 3: rechaza un tipo invalido', () => {
    const result = validateAgainstSchema({ title: 42 }, SCHEMA);
    expect(result.valid).toBe(false);
  });

  it('criterio 3: rechaza un texto que supera la longitud maxima', () => {
    const result = validateAgainstSchema({ title: 'x'.repeat(11) }, SCHEMA);
    expect(result.valid).toBe(false);
  });

  it('criterio 3: rechaza un campo no declarado en el esquema', () => {
    const result = validateAgainstSchema({ title: 'Hola', extra: 'no deberia estar' }, SCHEMA);
    expect(result.valid).toBe(false);
    expect(!result.valid && result.error.field).toBe('extra');
  });

  it('un campo opcional ausente no rechaza la entrada', () => {
    expect(validateAgainstSchema({ title: 'Hola' }, SCHEMA)).toEqual({ valid: true });
  });

  it('criterio 4: el mensaje de error nunca incluye detalles internos (nombre de clase, stack, driver)', () => {
    const result = validateAgainstSchema({ title: 42 }, SCHEMA);
    if (result.valid) throw new Error('se esperaba un resultado invalido');
    expect(result.error.message).not.toMatch(/TypeError|stack|mongodb|Error:/i);
  });
});
