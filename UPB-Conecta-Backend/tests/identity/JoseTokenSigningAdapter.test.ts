import { SignJWT, UnsecuredJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import {
  TokenRejectionReason,
  type SessionTokenClaims
} from '../../src/contexts/identity/domain/ports/out/TokenSigningPort.js';
import { JoseTokenSigningAdapter } from '../../src/contexts/identity/infrastructure/adapters/out/jwt/JoseTokenSigningAdapter.js';
import { ManualClock } from '../../src/contexts/identity/infrastructure/adapters/out/memory/SessionClocks.js';
import { readSessionConfig } from '../../src/contexts/identity/infrastructure/config/SessionConfig.js';
import { TEST_SIGNING_SECRET } from './sessionHarness.js';

const NOW = new Date('2026-09-22T12:00:00Z');
const config = readSessionConfig({ SESSION_SIGNING_SECRET: TEST_SIGNING_SECRET });
const key = new TextEncoder().encode(TEST_SIGNING_SECRET);

function claims(overrides: Partial<SessionTokenClaims> = {}): SessionTokenClaims {
  return {
    kind: 'access',
    subject: 'estudiante@upb.edu.co',
    chainId: 'cadena-1',
    tokenId: 'token-1',
    issuedAt: NOW,
    expiresAt: new Date(NOW.getTime() + 900_000),
    ...overrides
  };
}

describe('JoseTokenSigningAdapter — firma y verificación HS256 (HU-45)', () => {
  it('firma y verifica devolviendo los mismos claims', async () => {
    const adapter = new JoseTokenSigningAdapter(config, new ManualClock(NOW));

    const token = await adapter.sign(claims());

    expect(await adapter.verify(token, 'access')).toEqual({ valid: true, claims: claims() });
  });

  it('la vigencia se evalúa con el reloj inyectado, no con la hora de la máquina', async () => {
    const clock = new ManualClock(NOW);
    const adapter = new JoseTokenSigningAdapter(config, clock);
    const token = await adapter.sign(claims({ expiresAt: new Date(NOW.getTime() + 10_000) }));

    clock.advanceSeconds(10);

    expect(await adapter.verify(token, 'access')).toEqual({ valid: false, reason: TokenRejectionReason.EXPIRED });
  });

  it('rechaza un token sin firma (alg: none)', async () => {
    const adapter = new JoseTokenSigningAdapter(config, new ManualClock(NOW));
    const unsecured = new UnsecuredJWT({ token_use: 'access', sid: 'cadena-1' })
      .setSubject('estudiante@upb.edu.co')
      .setJti('token-1')
      .setIssuer(config.issuer)
      .setAudience(config.audience)
      .setIssuedAt(NOW)
      .setExpirationTime(new Date(NOW.getTime() + 900_000))
      .encode();

    expect(await adapter.verify(unsecured, 'access')).toEqual({
      valid: false,
      reason: TokenRejectionReason.INVALID_SIGNATURE
    });
  });

  it('rechaza un token bien firmado para otra audiencia', async () => {
    const adapter = new JoseTokenSigningAdapter(config, new ManualClock(NOW));
    const other = new JoseTokenSigningAdapter({ ...config, audience: 'otra-app' }, new ManualClock(NOW));

    const token = await other.sign(claims());

    expect(await adapter.verify(token, 'access')).toEqual({ valid: false, reason: TokenRejectionReason.MALFORMED });
  });

  it('rechaza un token firmado correctamente al que le faltan los claims de sesión', async () => {
    const adapter = new JoseTokenSigningAdapter(config, new ManualClock(NOW));
    const token = await new SignJWT({ token_use: 'access' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('estudiante@upb.edu.co')
      .setJti('token-1')
      .setIssuer(config.issuer)
      .setAudience(config.audience)
      .setIssuedAt(NOW)
      .setExpirationTime(new Date(NOW.getTime() + 900_000))
      .sign(key);

    expect(await adapter.verify(token, 'access')).toEqual({ valid: false, reason: TokenRejectionReason.MALFORMED });
  });

  it('distingue el tipo de token esperado', async () => {
    const adapter = new JoseTokenSigningAdapter(config, new ManualClock(NOW));

    const token = await adapter.sign(claims({ kind: 'refresh' }));

    expect(await adapter.verify(token, 'access')).toEqual({ valid: false, reason: TokenRejectionReason.WRONG_KIND });
  });
});
