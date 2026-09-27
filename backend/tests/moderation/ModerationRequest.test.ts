import { describe, expect, it } from 'vitest';
import { buildModerationRequest } from '../../src/contexts/moderation/domain/services/ModerationRequest.js';

const author = { name: 'Ana María Gómez', email: 'ana@upb.edu.co', studentId: '2024-0001' };

describe('HU-31 criterio 7 — la solicitud al servicio externo no lleva datos identificatorios', () => {
  it('solo contiene el texto: título y cuerpo', () => {
    const request = buildModerationRequest({ title: 'Hola', text: 'Cuerpo', author });
    expect(Object.keys(request)).toEqual(['text']);
    expect(request.text).toBe('Hola\nCuerpo');
  });

  it('enmascara correos, números largos y el nombre, correo e identificador del autor si aparecen en el texto', () => {
    const { text } = buildModerationRequest({
      title: 'Soy Ana Gómez',
      text: 'Escríbanme a ana@upb.edu.co o a otra@gmail.com, cel 300 123 4567, cédula 1.234.567.890, ID 2024-0001. Gracias, Ana María.',
      author
    });
    for (const leaked of ['ana@upb.edu.co', 'otra@gmail.com', '300 123 4567', '1.234.567.890', '2024-0001', 'Gómez', 'Gomez', 'María']) {
      expect(text).not.toContain(leaked);
    }
    expect(text).toContain('Gracias');
  });

  it('enmascara el nombre sin importar tildes ni mayúsculas', () => {
    const { text } = buildModerationRequest({ title: 't', text: 'ANA GOMEZ es tonta', author });
    expect(text.toLowerCase()).not.toContain('gomez');
  });

  it('no enmascara palabras cortas del nombre que son comunes ("de", "la")', () => {
    const { text } = buildModerationRequest({ title: 't', text: 'clase de cálculo en la mañana', author: { ...author, name: 'Luis de la Cruz' } });
    expect(text).toContain('clase de cálculo en la mañana');
    expect(buildModerationRequest({ title: 't', text: 'Cruz', author: { ...author, name: 'Luis de la Cruz' } }).text).not.toContain('Cruz');
  });
});
