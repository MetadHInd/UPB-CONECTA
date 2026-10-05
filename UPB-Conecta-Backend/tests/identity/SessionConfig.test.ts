import { describe, expect, it } from 'vitest';
import { InvalidSessionPolicyError, SessionPolicy } from '../../src/contexts/identity/domain/value-objects/SessionPolicy.js';
import {
  InvalidSessionConfigError,
  readSessionConfig
} from '../../src/contexts/identity/infrastructure/config/SessionConfig.js';
import { buildSessionHarness, login, TEST_SIGNING_SECRET } from './sessionHarness.js';

describe('HU-45 criterio 5 — la expiración es configurable sin recompilar', () => {
  it('lee las vigencias, el emisor y la audiencia desde variables de entorno', () => {
    const config = readSessionConfig({
      SESSION_SIGNING_SECRET: TEST_SIGNING_SECRET,
      SESSION_ACCESS_TOKEN_TTL_SECONDS: '120',
      SESSION_REFRESH_TOKEN_TTL_SECONDS: '3600',
      SESSION_TOKEN_ISSUER: 'upb-conecta-staging',
      SESSION_TOKEN_AUDIENCE: 'upb-conecta-android'
    });

    expect(config).toEqual({
      accessTokenTtlSeconds: 120,
      refreshTokenTtlSeconds: 3600,
      signingSecret: TEST_SIGNING_SECRET,
      issuer: 'upb-conecta-staging',
      audience: 'upb-conecta-android'
    });
  });

  it('usa valores por defecto conservadores cuando no se definen las vigencias', () => {
    const config = readSessionConfig({ SESSION_SIGNING_SECRET: TEST_SIGNING_SECRET });

    expect(config.accessTokenTtlSeconds).toBe(900);
    expect(config.refreshTokenTtlSeconds).toBe(2_592_000);
    expect(config.issuer).toBe('upb-conecta');
    expect(config.audience).toBe('upb-conecta-app');
  });

  it('el mismo código emite tokens con distinta vigencia según la configuración recibida', async () => {
    const short = buildSessionHarness({ env: { SESSION_ACCESS_TOKEN_TTL_SECONDS: '30' } });
    const long = buildSessionHarness({ env: { SESSION_ACCESS_TOKEN_TTL_SECONDS: '1800' } });

    const shortSession = await login(short);
    const longSession = await login(long);

    expect(shortSession.accessToken.expiresAt.getTime() - short.clock.now().getTime()).toBe(30_000);
    expect(longSession.accessToken.expiresAt.getTime() - long.clock.now().getTime()).toBe(1_800_000);
  });

  it('exige un secreto de firma y lo rechaza si es demasiado corto', () => {
    expect(() => readSessionConfig({})).toThrow(InvalidSessionConfigError);
    expect(() => readSessionConfig({ SESSION_SIGNING_SECRET: 'corto' })).toThrow(/al menos 32/);
  });

  it.each(['0', '-5', '1.5', 'quince'])('rechaza una vigencia inválida (%s)', (raw) => {
    expect(() =>
      readSessionConfig({ SESSION_SIGNING_SECRET: TEST_SIGNING_SECRET, SESSION_ACCESS_TOKEN_TTL_SECONDS: raw })
    ).toThrow(InvalidSessionConfigError);
  });

  it('rechaza una configuración donde el acceso dura tanto o más que el refresco', () => {
    expect(() =>
      readSessionConfig({
        SESSION_SIGNING_SECRET: TEST_SIGNING_SECRET,
        SESSION_ACCESS_TOKEN_TTL_SECONDS: '3600',
        SESSION_REFRESH_TOKEN_TTL_SECONDS: '3600'
      })
    ).toThrow(InvalidSessionPolicyError);
  });
});

describe('SessionPolicy (dominio)', () => {
  it('calcula la expiración de cada token a partir del instante de emisión', () => {
    const policy = SessionPolicy.create({ accessTokenTtlSeconds: 60, refreshTokenTtlSeconds: 600 });
    const issuedAt = new Date('2026-09-22T12:00:00Z');

    expect(policy.accessTokenExpiresAt(issuedAt)).toEqual(new Date('2026-09-22T12:01:00Z'));
    expect(policy.refreshTokenExpiresAt(issuedAt)).toEqual(new Date('2026-09-22T12:10:00Z'));
  });

  it.each([
    [{ accessTokenTtlSeconds: 0, refreshTokenTtlSeconds: 600 }, /acceso/],
    [{ accessTokenTtlSeconds: 1.5, refreshTokenTtlSeconds: 600 }, /acceso/],
    [{ accessTokenTtlSeconds: 60, refreshTokenTtlSeconds: -1 }, /refresco/],
    [{ accessTokenTtlSeconds: 600, refreshTokenTtlSeconds: 60 }, /antes que/]
  ])('rechaza políticas inválidas %o', (params, message) => {
    expect(() => SessionPolicy.create(params)).toThrow(message);
  });
});
