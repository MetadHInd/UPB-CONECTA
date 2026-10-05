import { describe, it, expect } from 'vitest';
import { MessageId, InvalidMessageIdError } from '../../src/contexts/ingestion/domain/value-objects/MessageId.js';

describe('MessageId, criterio de aceptacion 4', () => {
  it('normaliza los angulos y el relleno del encabezado', () => {
    const a = MessageId.fromHeader('  <CONV-001@upb.edu.co>  ');
    const b = MessageId.fromHeader('conv-001@upb.edu.co');
    expect(a.equals(b)).toBe(true);
  });

  it('distingue dos mensajes con el mismo asunto pero distinta identidad', () => {
    const original = MessageId.fromHeader('<conv-ingles@upb.edu.co>');
    const reenvio = MessageId.fromHeader('<conv-ingles-recordatorio@upb.edu.co>');
    expect(original.equals(reenvio)).toBe(false);
  });

  it('rechaza el mensaje sin encabezado porque no puede sostener idempotencia', () => {
    expect(() => MessageId.fromHeader(null)).toThrow(InvalidMessageIdError);
    expect(() => MessageId.fromHeader(undefined)).toThrow(InvalidMessageIdError);
    expect(() => MessageId.fromHeader('   ')).toThrow(InvalidMessageIdError);
  });

  it('rechaza un encabezado que no es un identificador global', () => {
    expect(() => MessageId.fromHeader('<solo-texto>')).toThrow(InvalidMessageIdError);
  });

  it('no considera iguales objetos de otro tipo', () => {
    const id = MessageId.fromHeader('<x@upb.edu.co>');
    expect(id.equals({ value: 'x@upb.edu.co' } as unknown as MessageId)).toBe(false);
  });
});
