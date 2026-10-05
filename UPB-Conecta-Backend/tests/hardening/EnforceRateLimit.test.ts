import { describe, expect, it } from 'vitest';
import { EnforceRateLimit, UnknownRateLimitedOperationError } from '../../src/contexts/hardening/application/EnforceRateLimit.js';
import { InMemorySlidingWindowRateLimiter } from '../../src/contexts/hardening/infrastructure/adapters/out/memory/InMemorySlidingWindowRateLimiter.js';
import { InMemoryRateLimitAuditLog } from '../../src/contexts/hardening/infrastructure/adapters/out/memory/InMemoryRateLimitAuditLog.js';
import type { RateLimitPolicyCatalog } from '../../src/contexts/hardening/domain/value-objects/RateLimitPolicy.js';

class ManualClock {
  constructor(private current: Date) {}
  now(): Date {
    return this.current;
  }
  advanceMs(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

const CATALOG: RateLimitPolicyCatalog = {
  policies: [{ operation: 'CreatePost', limit: 3, windowMs: 60_000 }]
};

function buildUseCase() {
  const clock = new ManualClock(new Date('2026-09-23T12:00:00Z'));
  const limiter = new InMemorySlidingWindowRateLimiter(clock);
  const auditLog = new InMemoryRateLimitAuditLog();
  const useCase = new EnforceRateLimit({ catalog: CATALOG, limiter, auditLog, clock });
  return { useCase, clock, auditLog };
}

describe('EnforceRateLimit (HU-47, criterios 5 y 6)', () => {
  it('criterio 5: permite peticiones mientras esten dentro del limite declarado', async () => {
    const { useCase } = buildUseCase();
    const subject = 'ana@upb.edu.co';

    for (let i = 0; i < 3; i++) {
      const outcome = await useCase.execute({ operation: 'CreatePost', subject, origin: '10.0.0.1' });
      expect(outcome.allowed).toBe(true);
    }
  });

  it('criterio 6: al superar el limite, la peticion se rechaza y el evento queda registrado', async () => {
    const { useCase, auditLog } = buildUseCase();
    const subject = 'ana@upb.edu.co';
    for (let i = 0; i < 3; i++) await useCase.execute({ operation: 'CreatePost', subject, origin: '10.0.0.1' });

    const rejected = await useCase.execute({ operation: 'CreatePost', subject, origin: '10.0.0.1' });

    expect(rejected).toEqual({ allowed: false, retryAfterMs: expect.any(Number) });
    expect(auditLog.events).toHaveLength(1);
    expect(auditLog.events[0]).toMatchObject({ operation: 'CreatePost', subject, origin: '10.0.0.1', limit: 3 });
  });

  it('el limite es por sujeto: otro estudiante no se ve afectado por el limite de ana', async () => {
    const { useCase } = buildUseCase();
    for (let i = 0; i < 3; i++) await useCase.execute({ operation: 'CreatePost', subject: 'ana@upb.edu.co', origin: '10.0.0.1' });

    const outcome = await useCase.execute({ operation: 'CreatePost', subject: 'luis@upb.edu.co', origin: '10.0.0.2' });

    expect(outcome.allowed).toBe(true);
  });

  it('la ventana desliza: pasado el tiempo configurado, el limite se libera', async () => {
    const { useCase, clock } = buildUseCase();
    const subject = 'ana@upb.edu.co';
    for (let i = 0; i < 3; i++) await useCase.execute({ operation: 'CreatePost', subject, origin: '10.0.0.1' });
    expect((await useCase.execute({ operation: 'CreatePost', subject, origin: '10.0.0.1' })).allowed).toBe(false);

    clock.advanceMs(60_001);

    expect((await useCase.execute({ operation: 'CreatePost', subject, origin: '10.0.0.1' })).allowed).toBe(true);
  });

  it('una operacion sin politica declarada se rechaza explicitamente', async () => {
    const { useCase } = buildUseCase();

    await expect(useCase.execute({ operation: 'OperacionInexistente', subject: 'ana@upb.edu.co', origin: '10.0.0.1' })).rejects.toBeInstanceOf(
      UnknownRateLimitedOperationError
    );
  });
});
