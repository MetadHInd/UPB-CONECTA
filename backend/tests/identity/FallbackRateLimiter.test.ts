import { describe, expect, it } from 'vitest';
import { FallbackRateLimiter } from '../../src/contexts/identity/infrastructure/adapters/out/FallbackRateLimiter.js';
import type { RateLimiterPort } from '../../src/contexts/identity/domain/ports/out/RateLimiterPort.js';

function limiter(label: string, calls: string[], options: { failing?: () => boolean } = {}): RateLimiterPort {
  const guard = () => {
    if (options.failing?.()) throw new Error(`${label} caido`);
  };
  return {
    checkAllowed: async () => (guard(), calls.push(`${label}:check`), true),
    recordFailure: async () => (guard(), void calls.push(`${label}:fail`)),
    recordSuccess: async () => (guard(), void calls.push(`${label}:ok`))
  };
}

describe('FallbackRateLimiter', () => {
  it('usa el principal mientras responde y no toca el respaldo', async () => {
    const calls: string[] = [];
    const l = new FallbackRateLimiter(limiter('redis', calls), limiter('mongo', calls), () => undefined);
    await l.checkAllowed('a', 'o');
    await l.recordFailure('a', 'o');
    await l.recordSuccess('a', 'o');
    expect(calls).toEqual(['redis:check', 'redis:fail', 'redis:ok']);
  });

  it('cae al respaldo en cada operacion cuando el principal falla, sin perder el limite', async () => {
    const calls: string[] = [];
    const l = new FallbackRateLimiter(limiter('redis', calls, { failing: () => true }), limiter('mongo', calls), () => undefined);
    expect(await l.checkAllowed('a', 'o')).toBe(true);
    await l.recordFailure('a', 'o');
    expect(calls).toEqual(['mongo:check', 'mongo:fail']);
  });

  it('avisa una sola vez al degradar y una al recuperarse', async () => {
    const calls: string[] = [];
    const logs: string[] = [];
    let down = true;
    const l = new FallbackRateLimiter(limiter('redis', calls, { failing: () => down }), limiter('mongo', calls), (m) => logs.push(m));
    await l.checkAllowed('a', 'o');
    await l.checkAllowed('a', 'o');
    await l.checkAllowed('a', 'o');
    expect(logs).toHaveLength(1);
    down = false;
    await l.checkAllowed('a', 'o');
    await l.checkAllowed('a', 'o');
    expect(logs).toHaveLength(2);
    expect(logs[1]).toMatch(/responde de nuevo/);
  });

  it('si tambien falla el respaldo, el error llega al llamador', async () => {
    const calls: string[] = [];
    const l = new FallbackRateLimiter(
      limiter('redis', calls, { failing: () => true }),
      limiter('mongo', calls, { failing: () => true }),
      () => undefined
    );
    await expect(l.checkAllowed('a', 'o')).rejects.toThrow('mongo caido');
  });
});
