import { describe, expect, it } from 'vitest';
import { BannedTermsDictionary } from '../../src/contexts/moderation/domain/services/BannedTermsDictionary.js';

const dictionary = new BannedTermsDictionary(['idiota', 'hijo de puta', 'Malparido']);

describe('HU-31 criterio 2 — diccionario configurable de términos y expresiones vetadas', () => {
  it('detecta un término sin importar mayúsculas ni tildes', () => {
    expect(dictionary.matches('Eres un IDIOTA total')).toBe(true);
    expect(new BannedTermsDictionary(['estúpido']).matches('qué estupido')).toBe(true);
  });

  it('detecta expresiones de varias palabras aunque cambien los espacios', () => {
    expect(dictionary.matches('ese   hijo\nde puta')).toBe(true);
  });

  it('solo coincide con palabras completas: no marca "idiomas" por "idio..."', () => {
    const d = new BannedTermsDictionary(['idiot']);
    expect(d.matches('clases de idiomas')).toBe(false);
    expect(d.matches('un idiot')).toBe(true);
  });

  it('un texto limpio no coincide y un diccionario vacío nunca coincide', () => {
    expect(dictionary.matches('Vendo calculadora Casio')).toBe(false);
    expect(new BannedTermsDictionary([]).matches('idiota')).toBe(false);
  });

  it('ignora entradas vacías del diccionario en lugar de bloquear todo', () => {
    expect(new BannedTermsDictionary(['', '   ']).matches('hola')).toBe(false);
  });

  it('caracteres especiales de expresión regular en un término se tratan como texto literal', () => {
    const d = new BannedTermsDictionary(['a.b', '(x']);
    expect(d.matches('aXb')).toBe(false);
    expect(d.matches('a.b')).toBe(true);
    expect(d.matches('mira (x aqui')).toBe(true);
  });
});
