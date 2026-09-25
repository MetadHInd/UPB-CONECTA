import { describe, expect, it } from 'vitest';
import { neutralizeHtml } from '../../src/contexts/hardening/domain/services/HtmlEncoding.js';

describe('neutralizeHtml (HU-47, criterio 7)', () => {
  it('neutraliza una etiqueta script', () => {
    expect(neutralizeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('neutraliza un atributo de evento embebido en una etiqueta', () => {
    const input = '<img src=x onerror="alert(1)">';
    const output = neutralizeHtml(input);
    expect(output).not.toContain('<img');
    expect(output).toContain('&lt;img');
  });

  it('preserva texto legitimo que usa < y > como puntuacion', () => {
    expect(neutralizeHtml('2 < 3 creditos y 5 > 2 semestres')).toBe('2 &lt; 3 creditos y 5 &gt; 2 semestres');
  });

  it('texto sin marcado queda intacto en su contenido visible', () => {
    expect(neutralizeHtml('Vendo calculadora Casio fx-991')).toBe('Vendo calculadora Casio fx-991');
  });

  it('neutraliza comillas usadas para escapar atributos HTML', () => {
    expect(neutralizeHtml(`"><script>alert(1)</script>`)).not.toContain('<script>');
  });
});
