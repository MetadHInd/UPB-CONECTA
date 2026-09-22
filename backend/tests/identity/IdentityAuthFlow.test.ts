import { describe, expect, it, vi } from 'vitest';
import { AuthenticateStudent } from '../../src/contexts/identity/application/AuthenticateStudent.js';
import { RealIdentityProviderAdapter } from '../../src/contexts/identity/infrastructure/adapters/out/real/RealIdentityProviderAdapter.js';
import { InMemoryIdentityProviderAdapter } from '../../src/contexts/identity/infrastructure/adapters/out/memory/InMemoryIdentityProviderAdapter.js';
import { InMemoryRateLimiter } from '../../src/contexts/identity/infrastructure/adapters/out/memory/InMemoryRateLimiter.js';
import { readIdentityRateLimitConfig } from '../../src/contexts/identity/infrastructure/config/IdentityRateLimitConfig.js';
import { AuthenticationError, AuthenticationFailureKind } from '../../src/contexts/identity/domain/entities/AuthenticationResult.js';
import { buildSessionHarness } from './sessionHarness.js';

describe('HU-43 — autenticación institucional', () => {
  it('valida credenciales contra el directorio institucional y devuelve los datos del perfil', async () => {
    const provider = new InMemoryIdentityProviderAdapter();
    const useCase = new AuthenticateStudent({ provider, rateLimiter: new InMemoryRateLimiter(), sessions: buildSessionHarness().sessions });

    const result = await useCase.execute({
      username: 'estudiante@upb.edu.co',
      password: 'S3cr3t!UPB',
      origin: '192.168.1.14'
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Se esperaba autenticación correcta');
    expect(result.profile.name).toBe('Ana Gómez');
    expect(result.profile.email).toBe('estudiante@upb.edu.co');
    expect(result.profile.program).toBe('Ingeniería de Sistemas');
    expect(result.profile.semester).toBe(5);
  });

  it('no almacena la contraseña ni la expone en ningún resultado serializado', async () => {
    const provider = new InMemoryIdentityProviderAdapter();
    const useCase = new AuthenticateStudent({ provider, rateLimiter: new InMemoryRateLimiter(), sessions: buildSessionHarness().sessions });

    const result = await useCase.execute({
      username: 'estudiante@upb.edu.co',
      password: 'S3cr3t!UPB',
      origin: '192.168.1.14'
    });

    const json = JSON.stringify(result);
    expect(json).not.toContain('S3cr3t!UPB');
    expect(json).not.toContain('password');
  });

  it('no revela si el usuario existe cuando la credencial es invalida', async () => {
    const provider = new InMemoryIdentityProviderAdapter();
    const useCase = new AuthenticateStudent({ provider, rateLimiter: new InMemoryRateLimiter(), sessions: buildSessionHarness().sessions });

    const result = await useCase.execute({
      username: 'noexiste@upb.edu.co',
      password: 'wrong-password',
      origin: '192.168.1.15'
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Las credenciales deberian fallar');
    expect(result.error).toBe(AuthenticationError.INVALID_CREDENTIALS);
    expect(result.message).toBe('Credenciales inválidas.');
    expect(result.message).not.toContain('no existe');
    expect(result.message).not.toContain('contraseña');
  });

  it('informa indisponibilidad del directorio sin exponer detalles técnicos', async () => {
    const provider = new RealIdentityProviderAdapter();
    const useCase = new AuthenticateStudent({ provider, rateLimiter: new InMemoryRateLimiter(), sessions: buildSessionHarness().sessions });

    const result = await useCase.execute({
      username: 'estudiante@upb.edu.co',
      password: 'S3cr3t!UPB',
      origin: '192.168.1.14'
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Se esperaba no disponibilidad');
    expect(result.error).toBe(AuthenticationFailureKind.PROVIDER_UNAVAILABLE);
    expect(result.message).toBe('El directorio institucional no está disponible en este momento.');
  });

  it('aplica limitación de tasa por cuenta y por origen', async () => {
    const provider = new InMemoryIdentityProviderAdapter();
    const rateLimiter = new InMemoryRateLimiter({ maxAttemptsPerAccount: 2, maxAttemptsPerOrigin: 2, windowMs: 60_000 });
    const useCase = new AuthenticateStudent({ provider, rateLimiter, sessions: buildSessionHarness().sessions });

    await useCase.execute({ username: 'estudiante@upb.edu.co', password: 'wrong', origin: '10.0.0.1' });
    await useCase.execute({ username: 'estudiante@upb.edu.co', password: 'wrong', origin: '10.0.0.1' });

    const blocked = await useCase.execute({ username: 'estudiante@upb.edu.co', password: 'wrong', origin: '10.0.0.1' });
    expect(blocked.ok).toBe(false);
    if (blocked.ok) throw new Error('Se esperaba bloqueo de tasa');
    expect(blocked.error).toBe(AuthenticationFailureKind.RATE_LIMITED);

    const otherOrigin = await useCase.execute({ username: 'otheruser@upb.edu.co', password: 'wrong', origin: '10.0.0.2' });
    expect(otherOrigin.ok).toBe(false);
    if (otherOrigin.ok) throw new Error('Se esperaba bloqueo por origen');
    expect(otherOrigin.error).toBe(AuthenticationFailureKind.RATE_LIMITED);
  });

  it('no registra la contraseña en ninguna llamada de console durante un intento fallido y uno exitoso', async () => {
    const provider = new InMemoryIdentityProviderAdapter();
    const useCase = new AuthenticateStudent({ provider, rateLimiter: new InMemoryRateLimiter(), sessions: buildSessionHarness().sessions });
    const password = 'S3cr3t!UPB';

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      await useCase.execute({
        username: 'noexiste@upb.edu.co',
        password: 'wrong-password',
        origin: '192.168.1.16'
      });

      await useCase.execute({
        username: 'estudiante@upb.edu.co',
        password,
        origin: '192.168.1.16'
      });

      const allConsolePayloads = [
        ...logSpy.mock.calls,
        ...errorSpy.mock.calls,
        ...warnSpy.mock.calls
      ].flatMap((args) => args.map((arg) => String(arg)));

      expect(allConsolePayloads.join(' ')).not.toContain(password);
      expect(allConsolePayloads.join(' ')).not.toContain('password');
    } finally {
      logSpy.mockRestore();
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  it('lee la configuración del rate limit desde variables de entorno', () => {
    const config = readIdentityRateLimitConfig({
      IDENTITY_RATE_LIMIT_WINDOW_MS: '120000',
      IDENTITY_RATE_LIMIT_MAX_PER_ACCOUNT: '4',
      IDENTITY_RATE_LIMIT_MAX_PER_ORIGIN: '7'
    });

    expect(config.windowMs).toBe(120_000);
    expect(config.maxAttemptsPerAccount).toBe(4);
    expect(config.maxAttemptsPerOrigin).toBe(7);
  });
});
