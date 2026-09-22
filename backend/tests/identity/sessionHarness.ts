import { AuthenticateStudent } from '../../src/contexts/identity/application/AuthenticateStudent.js';
import { LogoutSession } from '../../src/contexts/identity/application/LogoutSession.js';
import { RefreshSession } from '../../src/contexts/identity/application/RefreshSession.js';
import { SessionTokenIssuer } from '../../src/contexts/identity/application/SessionTokenIssuer.js';
import { VerifyAccessToken } from '../../src/contexts/identity/application/VerifyAccessToken.js';
import type { AuthenticatedProfileSyncPort } from '../../src/contexts/identity/domain/ports/out/AuthenticatedProfileSyncPort.js';
import type { RefreshTokenRepositoryPort } from '../../src/contexts/identity/domain/ports/out/RefreshTokenRepositoryPort.js';
import { SessionPolicy } from '../../src/contexts/identity/domain/value-objects/SessionPolicy.js';
import { RandomSessionIdGenerator } from '../../src/contexts/identity/infrastructure/adapters/out/crypto/RandomSessionIdGenerator.js';
import { JoseTokenSigningAdapter } from '../../src/contexts/identity/infrastructure/adapters/out/jwt/JoseTokenSigningAdapter.js';
import { InMemoryIdentityProviderAdapter } from '../../src/contexts/identity/infrastructure/adapters/out/memory/InMemoryIdentityProviderAdapter.js';
import { InMemoryRateLimiter } from '../../src/contexts/identity/infrastructure/adapters/out/memory/InMemoryRateLimiter.js';
import { InMemoryRefreshTokenRepository } from '../../src/contexts/identity/infrastructure/adapters/out/memory/InMemoryRefreshTokenRepository.js';
import { InMemorySecurityAuditLog } from '../../src/contexts/identity/infrastructure/adapters/out/memory/InMemorySecurityAuditLog.js';
import { ManualClock } from '../../src/contexts/identity/infrastructure/adapters/out/memory/SessionClocks.js';
import { readSessionConfig } from '../../src/contexts/identity/infrastructure/config/SessionConfig.js';

export const TEST_SIGNING_SECRET = 'secreto-de-pruebas-hu45-con-mas-de-32-caracteres';
export const STUDENT = { username: 'estudiante@upb.edu.co', password: 'S3cr3t!UPB' };

/** Sincronización de perfil que no hace nada: las pruebas de sesión no la observan. */
export const ignoreProfileSync: AuthenticatedProfileSyncPort = { syncFromDirectory: async () => undefined };

/**
 * Cablea el flujo completo de sesion con el adaptador JWT real (firma real,
 * no un doble) y un reloj manual para mover el tiempo en las pruebas.
 */
export function buildSessionHarness(
  options: {
    readonly env?: NodeJS.ProcessEnv;
    readonly refreshTokens?: RefreshTokenRepositoryPort;
    readonly start?: Date;
    readonly profileSync?: AuthenticatedProfileSyncPort;
  } = {}
) {
  const config = readSessionConfig({ SESSION_SIGNING_SECRET: TEST_SIGNING_SECRET, ...options.env });
  const clock = new ManualClock(options.start ?? new Date('2026-09-22T12:00:00Z'));
  const signer = new JoseTokenSigningAdapter(config, clock);
  const refreshTokens = options.refreshTokens ?? new InMemoryRefreshTokenRepository();
  const audit = new InMemorySecurityAuditLog();
  const policy = SessionPolicy.create(config);
  const provider = new InMemoryIdentityProviderAdapter();
  const sessions = new SessionTokenIssuer({ signer, refreshTokens, clock, ids: new RandomSessionIdGenerator(), policy });

  return {
    config,
    clock,
    signer,
    refreshTokens,
    audit,
    policy,
    sessions,
    provider,
    authenticate: new AuthenticateStudent({
      provider,
      rateLimiter: new InMemoryRateLimiter(),
      sessions,
      profileSync: options.profileSync ?? ignoreProfileSync
    }),
    refresh: new RefreshSession({ signer, refreshTokens, audit, clock, sessions }),
    verifyAccess: new VerifyAccessToken({ signer, refreshTokens, audit, clock }),
    logout: new LogoutSession({ signer, refreshTokens, audit, clock })
  };
}

export type SessionHarness = ReturnType<typeof buildSessionHarness>;

export async function login(harness: SessionHarness, origin = '10.0.0.1') {
  const result = await harness.authenticate.execute({ ...STUDENT, origin });
  if (!result.ok) throw new Error(`Se esperaba autenticacion correcta: ${result.message}`);
  return result.session;
}
