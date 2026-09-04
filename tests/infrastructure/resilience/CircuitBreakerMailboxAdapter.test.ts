import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CircuitBreakerMailboxAdapter } from '../../../src/contexts/ingestion/infrastructure/adapters/out/resilience/CircuitBreakerMailboxAdapter.js';
import { RetryingMailboxAdapter } from '../../../src/contexts/ingestion/infrastructure/adapters/out/resilience/RetryingMailboxAdapter.js';
import { MailboxUnavailableError } from '../../../src/contexts/ingestion/domain/ports/out/MailboxIngestionPort.js';
import { FixedClock } from '../../../src/contexts/ingestion/infrastructure/adapters/out/memory/SystemClock.js';

describe('CircuitBreakerMailboxAdapter - apertura, enfriamiento y mitad-abierto', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  function makeCursor(): any { return { value: 'c' }; }

  it('abre el circuito tras alcanzar el umbral de fallos consecutivos', async () => {
    const delegate = {
      fetchUnprocessed: async () => { throw new MailboxUnavailableError('siempre caido'); }
    };

    const retry = new RetryingMailboxAdapter(delegate as any, { maxRetries: 0, baseMs: 1000, maxMs: 30_000 });
    const cb = new CircuitBreakerMailboxAdapter(retry as any, { failureThreshold: 2, cooldownMs: 60_000, clock: new FixedClock(new Date()) });

    // dos fallos consecutivos deben abrir el circuito
    await expect(cb.fetchUnprocessed(makeCursor(), 10)).rejects.toThrow(MailboxUnavailableError);
    await expect(cb.fetchUnprocessed(makeCursor(), 10)).rejects.toThrow(MailboxUnavailableError);

    // tercer intento: circuito abierto -> fallo rapido
    const t = cb.fetchUnprocessed(makeCursor(), 10);
    await expect(t).rejects.toThrow(MailboxUnavailableError);
  });

  it('mientras abierto falla rapido sin invocar al adaptador', async () => {
    const calls = { n: 0 };
    const delegate = {
      fetchUnprocessed: async () => { calls.n += 1; throw new MailboxUnavailableError('siempre caido'); }
    };

    const retry = new RetryingMailboxAdapter(delegate as any, { maxRetries: 0, baseMs: 1000, maxMs: 30_000 });
    const clock = new FixedClock(new Date());
    const cb = new CircuitBreakerMailboxAdapter(retry as any, { failureThreshold: 1, cooldownMs: 60_000, clock });

    // primer fallo abre circuito
    await expect(cb.fetchUnprocessed(makeCursor(), 10)).rejects.toThrow(MailboxUnavailableError);
    expect(calls.n).toBe(1);

    // cuando está abierto, las llamadas fallan rapido y no aumentan calls.n
    await expect(cb.fetchUnprocessed(makeCursor(), 10)).rejects.toThrow(MailboxUnavailableError);
    expect(calls.n).toBe(1);
  });

  it('transiciona a half-open tras cooldown y cierra si el intento es exitoso', async () => {
    let down = true;
    const delegate = {
      fetchUnprocessed: async () => {
        if (down) throw new MailboxUnavailableError('caido');
        return [{ id: 'ok' }];
      }
    };

    const retry = new RetryingMailboxAdapter(delegate as any, { maxRetries: 0, baseMs: 1000, maxMs: 30_000 });
    const clock = new FixedClock(new Date());
    const cb = new CircuitBreakerMailboxAdapter(retry as any, { failureThreshold: 1, cooldownMs: 60_000, clock });

    // primer fallo abre circuito
    await expect(cb.fetchUnprocessed(makeCursor(), 10)).rejects.toThrow(MailboxUnavailableError);

    // avanzar el reloj menos que el cooldown -> sigue abierto
    clock.advance(30_000);
    await expect(cb.fetchUnprocessed(makeCursor(), 10)).rejects.toThrow(MailboxUnavailableError);

    // avanzar hasta el cooldown -> pasa a half-open
    clock.advance(30_000);

    // ahora el servicio se recupera
    down = false;
    const res = await cb.fetchUnprocessed(makeCursor(), 10);
    expect(res).toHaveLength(1);

    // posteriores llamadas exitosas no abren circuito
    const res2 = await cb.fetchUnprocessed(makeCursor(), 10);
    expect(res2).toHaveLength(1);
  });

  it('reabre el circuito si el intento half-open falla', async () => {
    let down = true;
    const delegate = {
      fetchUnprocessed: async () => {
        if (down) throw new MailboxUnavailableError('caido');
        return [{ id: 'ok' }];
      }
    };

    const retry = new RetryingMailboxAdapter(delegate as any, { maxRetries: 0, baseMs: 1000, maxMs: 30_000 });
    const clock = new FixedClock(new Date());
    const cb = new CircuitBreakerMailboxAdapter(retry as any, { failureThreshold: 1, cooldownMs: 60_000, clock });

    // primer fallo abre circuito
    await expect(cb.fetchUnprocessed(makeCursor(), 10)).rejects.toThrow(MailboxUnavailableError);

    // avanzar al cooldown
    clock.advance(60_000);

    // half-open attempt: el servicio sigue caido
    await expect(cb.fetchUnprocessed(makeCursor(), 10)).rejects.toThrow(MailboxUnavailableError);

    // el circuito debe permanecer abierto y seguir fallando rapido
    await expect(cb.fetchUnprocessed(makeCursor(), 10)).rejects.toThrow(MailboxUnavailableError);
  });
});
