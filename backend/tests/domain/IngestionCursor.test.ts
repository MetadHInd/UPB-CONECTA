import { describe, it, expect } from 'vitest';
import { IngestionCursor } from '../../src/contexts/ingestion/domain/value-objects/IngestionCursor.js';

describe('IngestionCursor, criterio de aceptacion 5', () => {
  const t = new Date('2026-08-24T10:00:00Z');

  it('arranca en cero cuando no hay lectura previa', () => {
    expect(IngestionCursor.initial().lastConfirmedUid).toBe(0);
  });

  it('avanza solo hacia adelante', () => {
    const cursor = IngestionCursor.initial().advanceTo(105, t);
    expect(cursor.lastConfirmedUid).toBe(105);
  });

  it('no retrocede ante un uid inferior o igual al confirmado', () => {
    const cursor = IngestionCursor.initial().advanceTo(105, t);
    expect(cursor.advanceTo(90, t).lastConfirmedUid).toBe(105);
    expect(cursor.advanceTo(105, t).lastConfirmedUid).toBe(105);
  });

  it('es inmutable: avanzar devuelve una instancia nueva', () => {
    const original = IngestionCursor.initial();
    const avanzado = original.advanceTo(10, t);
    expect(original.lastConfirmedUid).toBe(0);
    expect(avanzado).not.toBe(original);
  });

  it('restaura un punto de lectura persistido y rechaza valores invalidos', () => {
    expect(IngestionCursor.restore(42, t).lastConfirmedUid).toBe(42);
    expect(() => IngestionCursor.restore(-1, t)).toThrow(RangeError);
    expect(() => IngestionCursor.restore(1.5, t)).toThrow(RangeError);
  });

  it('compara por punto de lectura', () => {
    expect(IngestionCursor.restore(7, null).equals(IngestionCursor.restore(7, t))).toBe(true);
    expect(IngestionCursor.restore(7, null).equals(IngestionCursor.restore(8, t))).toBe(false);
  });
});
