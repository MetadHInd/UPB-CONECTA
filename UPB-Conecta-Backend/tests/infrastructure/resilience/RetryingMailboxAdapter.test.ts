import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RetryingMailboxAdapter } from '../../../src/contexts/ingestion/infrastructure/adapters/out/resilience/RetryingMailboxAdapter.js';
import { MailboxUnavailableError } from '../../../src/contexts/ingestion/domain/ports/out/MailboxIngestionPort.js';

describe('RetryingMailboxAdapter (HU-05) - reintentos con backoff exponencial', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  function makeCursor(): any { return { value: 'cursor' }; }

  it('reintenta con backoff creciente y devuelve resultados cuando el adaptador se recupera', async () => {
    const calls: number[] = [];
    const delegate = {
      fetchUnprocessed: async () => {
        calls.push(Date.now());
        if (calls.length < 3) throw new MailboxUnavailableError('simulado');
        return [{ id: 'm1' }];
      }
    };

    const adapter = new RetryingMailboxAdapter(delegate as any, { maxRetries: 5, baseMs: 1000, maxMs: 30_000 });

    const promise = adapter.fetchUnprocessed(makeCursor(), 10);

    // primer intento ocurre inmediatamente
    expect(calls.length).toBe(1);

    // avanzar 1s -> segundo intento
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls.length).toBe(2);

    // avanzar 2s -> tercer intento, que devuelve
    await vi.advanceTimersByTimeAsync(2000);
    const res = await promise;
    expect(calls.length).toBe(3);
    expect(res).toHaveLength(1);
  });

  it('agota reintentos y propaga MailboxUnavailableError', async () => {
    const calls = { n: 0 };
    const delegate = {
      fetchUnprocessed: async () => {
        calls.n += 1;
        throw new MailboxUnavailableError('siempre caido');
      }
    };

    const adapter = new RetryingMailboxAdapter(delegate as any, { maxRetries: 1, baseMs: 1000, maxMs: 30_000 });
    const p = adapter.fetchUnprocessed(makeCursor(), 10);

    // attach the rejection assertion immediately to avoid a race where the
    // promise rejects before the test hooks up the expectation
    const assertion = expect(p).rejects.toThrow(MailboxUnavailableError);

    expect(calls.n).toBe(1);
    await vi.advanceTimersByTimeAsync(1000); // retry
    await assertion;
    expect(calls.n).toBe(2);
  });
});
