import { describe, expect, it } from 'vitest';
import { SessionFailureKind } from '../../src/contexts/identity/domain/entities/SessionResult.js';
import { SecurityAuditEventKind } from '../../src/contexts/identity/domain/ports/out/SecurityAuditLogPort.js';
import { TokenRejectionReason } from '../../src/contexts/identity/domain/ports/out/TokenSigningPort.js';
import { buildSessionHarness, login, TEST_SIGNING_SECRET } from './sessionHarness.js';

const ORIGIN = '10.0.0.1';

function tamperPayload(token: string, patch: Record<string, unknown>): string {
  const [header, payload, signature] = token.split('.');
  const claims = JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8')) as Record<string, unknown>;
  const forged = Buffer.from(JSON.stringify({ ...claims, ...patch })).toString('base64url');
  return `${header}.${forged}.${signature}`;
}

describe('HU-45 — expiración de sesión y rotación de refresh token (RF-72, RF-64, RNF-17)', () => {
  describe('inicio de sesión', () => {
    it('la autenticación correcta emite un par access + refresh con la vigencia de la política', async () => {
      const harness = buildSessionHarness({
        env: { SESSION_ACCESS_TOKEN_TTL_SECONDS: '600', SESSION_REFRESH_TOKEN_TTL_SECONDS: '86400' }
      });
      const now = harness.clock.now();

      const session = await login(harness);

      expect(session.accessToken.value.split('.')).toHaveLength(3);
      expect(session.refreshToken.value.split('.')).toHaveLength(3);
      expect(session.accessToken.value).not.toBe(session.refreshToken.value);
      expect(session.accessToken.expiresAt).toEqual(new Date(now.getTime() + 600_000));
      expect(session.refreshToken.expiresAt).toEqual(new Date(now.getTime() + 86_400_000));
      expect(await harness.refreshTokens.isChainRevoked(session.sessionId)).toBe(false);
    });

    it('no emite tokens cuando las credenciales son inválidas', async () => {
      const harness = buildSessionHarness();

      const result = await harness.authenticate.execute({ username: 'estudiante@upb.edu.co', password: 'mala', origin: ORIGIN });

      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).not.toContain('session');
    });
  });

  describe('criterio 1 — el token de acceso expira tras el periodo configurado', () => {
    it('se acepta dentro del periodo y se rechaza como expirado al cumplirse', async () => {
      const harness = buildSessionHarness({ env: { SESSION_ACCESS_TOKEN_TTL_SECONDS: '300' } });
      const session = await login(harness);

      harness.clock.advanceSeconds(299);
      const stillValid = await harness.verifyAccess.execute({ accessToken: session.accessToken.value, origin: ORIGIN });
      expect(stillValid).toEqual({
        ok: true,
        principal: { subject: 'estudiante@upb.edu.co', sessionId: session.sessionId }
      });

      harness.clock.advanceSeconds(1);
      const expired = await harness.verifyAccess.execute({ accessToken: session.accessToken.value, origin: ORIGIN });
      expect(expired.ok).toBe(false);
      if (expired.ok) throw new Error('Se esperaba token expirado');
      expect(expired.error).toBe(SessionFailureKind.TOKEN_EXPIRED);
      expect(expired.requiresReauthentication).toBe(false);
    });

    it('un token expirado no es un ataque: no queda registrado como intento de manipulación', async () => {
      const harness = buildSessionHarness();
      const session = await login(harness);
      harness.clock.advanceSeconds(harness.config.accessTokenTtlSeconds);

      await harness.verifyAccess.execute({ accessToken: session.accessToken.value, origin: ORIGIN });

      expect(harness.audit.events).toHaveLength(0);
    });

    it('un refresh token expirado tampoco permite renovar y obliga a autenticarse', async () => {
      const harness = buildSessionHarness();
      const session = await login(harness);
      harness.clock.advanceSeconds(harness.config.refreshTokenTtlSeconds);

      const result = await harness.refresh.execute({ refreshToken: session.refreshToken.value, origin: ORIGIN });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('Se esperaba refresh expirado');
      expect(result.error).toBe(SessionFailureKind.TOKEN_EXPIRED);
      expect(result.requiresReauthentication).toBe(true);
    });
  });

  describe('criterio 2 — renovación con refresh token vigente sin pedir credenciales', () => {
    it('con el acceso expirado y el refresh vigente obtiene un nuevo acceso válido en la misma sesión', async () => {
      const harness = buildSessionHarness({ env: { SESSION_ACCESS_TOKEN_TTL_SECONDS: '60' } });
      const session = await login(harness);
      harness.clock.advanceSeconds(61);

      const renewed = await harness.refresh.execute({ refreshToken: session.refreshToken.value, origin: ORIGIN });

      expect(renewed.ok).toBe(true);
      if (!renewed.ok) throw new Error('Se esperaba renovación');
      expect(renewed.tokens.sessionId).toBe(session.sessionId);
      expect(renewed.tokens.accessToken.expiresAt).toEqual(new Date(harness.clock.now().getTime() + 60_000));
      const verified = await harness.verifyAccess.execute({ accessToken: renewed.tokens.accessToken.value, origin: ORIGIN });
      expect(verified.ok).toBe(true);
    });

    it('rota el refresh token: el nuevo es distinto y el anterior queda marcado como usado', async () => {
      const harness = buildSessionHarness();
      const session = await login(harness);

      const renewed = await harness.refresh.execute({ refreshToken: session.refreshToken.value, origin: ORIGIN });

      if (!renewed.ok) throw new Error('Se esperaba renovación');
      expect(renewed.tokens.refreshToken.value).not.toBe(session.refreshToken.value);
      const previous = await harness.signer.verify(session.refreshToken.value, 'refresh');
      if (!previous.valid) throw new Error('El token anterior sigue teniendo firma válida');
      const record = await harness.refreshTokens.findByTokenId(previous.claims.tokenId);
      expect(record?.status).toBe('used');
      expect(record?.usedAt).toEqual(harness.clock.now());
    });

    it('no acepta un token de acceso en lugar del refresh token', async () => {
      const harness = buildSessionHarness();
      const session = await login(harness);

      const result = await harness.refresh.execute({ refreshToken: session.accessToken.value, origin: ORIGIN });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('Se esperaba rechazo');
      expect(result.error).toBe(SessionFailureKind.INVALID_TOKEN);
      expect(harness.audit.events[0]?.reason).toBe(TokenRejectionReason.WRONG_KIND);
    });

    it('no acepta un refresh token en lugar del token de acceso', async () => {
      const harness = buildSessionHarness();
      const session = await login(harness);

      const result = await harness.verifyAccess.execute({ accessToken: session.refreshToken.value, origin: ORIGIN });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('Se esperaba rechazo');
      expect(result.error).toBe(SessionFailureKind.INVALID_TOKEN);
    });

    it('rechaza un refresh token con firma válida que el repositorio no conoce', async () => {
      const harness = buildSessionHarness();
      const now = harness.clock.now();
      const orphan = await harness.signer.sign({
        kind: 'refresh',
        subject: 'estudiante@upb.edu.co',
        chainId: 'cadena-inexistente',
        tokenId: 'token-inexistente',
        issuedAt: now,
        expiresAt: harness.policy.refreshTokenExpiresAt(now)
      });

      const result = await harness.refresh.execute({ refreshToken: orphan, origin: ORIGIN });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('Se esperaba rechazo');
      expect(result.error).toBe(SessionFailureKind.INVALID_TOKEN);
      expect(result.requiresReauthentication).toBe(true);
    });
  });

  describe('criterio 3 — el cierre de sesión invalida el refresh token', () => {
    it('tras el logout el refresh token ya no permite renovar', async () => {
      const harness = buildSessionHarness();
      const session = await login(harness);

      const loggedOut = await harness.logout.execute({ refreshToken: session.refreshToken.value, origin: ORIGIN });
      expect(loggedOut).toEqual({ ok: true });

      const result = await harness.refresh.execute({ refreshToken: session.refreshToken.value, origin: ORIGIN });
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('Se esperaba rechazo');
      expect(result.error).toBe(SessionFailureKind.SESSION_REVOKED);
      expect(result.requiresReauthentication).toBe(true);
    });

    it('el token de acceso de la sesión cerrada deja de aceptarse sin esperar a que expire', async () => {
      const harness = buildSessionHarness();
      const session = await login(harness);

      await harness.logout.execute({ refreshToken: session.refreshToken.value, origin: ORIGIN });

      const result = await harness.verifyAccess.execute({ accessToken: session.accessToken.value, origin: ORIGIN });
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('Se esperaba rechazo');
      expect(result.error).toBe(SessionFailureKind.SESSION_REVOKED);
    });

    it('queda persistido con motivo logout y solo afecta a esa sesión, no a otra del mismo estudiante', async () => {
      const harness = buildSessionHarness();
      const phone = await login(harness, '10.0.0.1');
      const tablet = await login(harness, '10.0.0.2');

      await harness.logout.execute({ refreshToken: phone.refreshToken.value, origin: ORIGIN });

      const claims = await harness.signer.verify(phone.refreshToken.value, 'refresh');
      if (!claims.valid) throw new Error('firma válida esperada');
      const record = await harness.refreshTokens.findByTokenId(claims.claims.tokenId);
      expect(record).toMatchObject({ status: 'revoked', revokedReason: 'logout', revokedAt: harness.clock.now() });
      const tabletRenewal = await harness.refresh.execute({ refreshToken: tablet.refreshToken.value, origin: ORIGIN });
      expect(tabletRenewal.ok).toBe(true);
    });

    it('cerrar sesión dos veces es idempotente', async () => {
      const harness = buildSessionHarness();
      const session = await login(harness);

      await harness.logout.execute({ refreshToken: session.refreshToken.value, origin: ORIGIN });
      const second = await harness.logout.execute({ refreshToken: session.refreshToken.value, origin: ORIGIN });

      expect(second).toEqual({ ok: true });
    });

    it('rechaza el logout con un refresh token manipulado y lo registra', async () => {
      const harness = buildSessionHarness();
      const session = await login(harness);

      const result = await harness.logout.execute({
        refreshToken: tamperPayload(session.refreshToken.value, { sid: 'otra-cadena' }),
        origin: ORIGIN
      });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('Se esperaba rechazo');
      expect(result.error).toBe(SessionFailureKind.INVALID_TOKEN);
      expect(harness.audit.events).toHaveLength(1);
      expect(await harness.refreshTokens.isChainRevoked(session.sessionId)).toBe(false);
    });

    it('un logout con refresh token expirado se informa como expirado', async () => {
      const harness = buildSessionHarness();
      const session = await login(harness);
      harness.clock.advanceSeconds(harness.config.refreshTokenTtlSeconds);

      const result = await harness.logout.execute({ refreshToken: session.refreshToken.value, origin: ORIGIN });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('Se esperaba rechazo');
      expect(result.error).toBe(SessionFailureKind.TOKEN_EXPIRED);
    });
  });

  describe('criterio 4 — reuso de un refresh token ya utilizado', () => {
    it('cadena de 3 rotaciones: reusar un token de mitad de cadena invalida la cadena completa', async () => {
      const harness = buildSessionHarness();
      const r1 = await login(harness);

      const rotations = [];
      let current = r1;
      for (let i = 0; i < 3; i += 1) {
        harness.clock.advanceSeconds(60);
        const renewed = await harness.refresh.execute({ refreshToken: current.refreshToken.value, origin: ORIGIN });
        if (!renewed.ok) throw new Error(`La rotación ${i + 1} debía funcionar: ${renewed.error}`);
        expect(renewed.tokens.sessionId).toBe(r1.sessionId);
        rotations.push(renewed.tokens);
        current = renewed.tokens;
      }
      const [r2, , r4] = rotations;

      // Un atacante presenta R2, que ya se había rotado.
      const reuse = await harness.refresh.execute({ refreshToken: r2!.refreshToken.value, origin: '203.0.113.9' });
      expect(reuse.ok).toBe(false);
      if (reuse.ok) throw new Error('Se esperaba detección de reuso');
      expect(reuse.error).toBe(SessionFailureKind.REFRESH_TOKEN_REUSE);
      expect(reuse.requiresReauthentication).toBe(true);

      // El token vigente del estudiante legítimo (R4) también quedó invalidado.
      const legit = await harness.refresh.execute({ refreshToken: r4!.refreshToken.value, origin: ORIGIN });
      expect(legit.ok).toBe(false);
      if (legit.ok) throw new Error('La cadena completa debía quedar invalidada');
      expect(legit.error).toBe(SessionFailureKind.SESSION_REVOKED);

      // Y ningún token de la cadena, ni el primero, vuelve a servir.
      const first = await harness.refresh.execute({ refreshToken: r1.refreshToken.value, origin: ORIGIN });
      expect(first.ok).toBe(false);
      const access = await harness.verifyAccess.execute({ accessToken: r4!.accessToken.value, origin: ORIGIN });
      expect(access.ok).toBe(false);
      if (access.ok) throw new Error('El acceso de la cadena invalidada debía rechazarse');
      expect(access.error).toBe(SessionFailureKind.SESSION_REVOKED);
      expect(await harness.refreshTokens.isChainRevoked(r1.sessionId)).toBe(true);

      // Los cuatro registros de la cadena quedan revocados por reuso.
      for (const tokens of [r1, ...rotations]) {
        const verified = await harness.signer.verify(tokens.refreshToken.value, 'refresh');
        if (!verified.valid) throw new Error('firma válida esperada');
        const record = await harness.refreshTokens.findByTokenId(verified.claims.tokenId);
        expect(record).toMatchObject({ status: 'revoked', revokedReason: 'reuse-detected' });
      }
    });

    it('el reuso queda registrado en la auditoría con la cadena y el origen', async () => {
      const harness = buildSessionHarness();
      const session = await login(harness);
      await harness.refresh.execute({ refreshToken: session.refreshToken.value, origin: ORIGIN });

      await harness.refresh.execute({ refreshToken: session.refreshToken.value, origin: '203.0.113.9' });

      expect(harness.audit.events).toEqual([
        {
          kind: SecurityAuditEventKind.REFRESH_TOKEN_REUSE,
          occurredAt: harness.clock.now(),
          origin: '203.0.113.9',
          tokenKind: 'refresh',
          reason: 'reuse-detected',
          chainId: session.sessionId,
          subject: 'estudiante@upb.edu.co'
        }
      ]);
    });

    it('obliga a autenticarse de nuevo: un login nuevo abre una cadena independiente que sí funciona', async () => {
      const harness = buildSessionHarness();
      const session = await login(harness);
      await harness.refresh.execute({ refreshToken: session.refreshToken.value, origin: ORIGIN });
      await harness.refresh.execute({ refreshToken: session.refreshToken.value, origin: ORIGIN });

      const fresh = await login(harness);

      expect(fresh.sessionId).not.toBe(session.sessionId);
      const renewed = await harness.refresh.execute({ refreshToken: fresh.refreshToken.value, origin: ORIGIN });
      expect(renewed.ok).toBe(true);
    });

    it('dos renovaciones concurrentes con el mismo token: solo una gana y la otra se trata como reuso', async () => {
      const harness = buildSessionHarness();
      const session = await login(harness);

      const results = await Promise.all([
        harness.refresh.execute({ refreshToken: session.refreshToken.value, origin: ORIGIN }),
        harness.refresh.execute({ refreshToken: session.refreshToken.value, origin: ORIGIN })
      ]);

      expect(results.filter((r) => r.ok)).toHaveLength(1);
      const failure = results.find((r) => !r.ok);
      expect(failure).toMatchObject({ error: SessionFailureKind.REFRESH_TOKEN_REUSE });
      expect(await harness.refreshTokens.isChainRevoked(session.sessionId)).toBe(true);
    });
  });

  describe('criterio 6 — token manipulado o con firma inválida', () => {
    it('rechaza un access token con el payload alterado y registra el intento', async () => {
      const harness = buildSessionHarness();
      const session = await login(harness);
      const forged = tamperPayload(session.accessToken.value, { sub: 'otro@upb.edu.co' });

      const result = await harness.verifyAccess.execute({ accessToken: forged, origin: '198.51.100.7' });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('Se esperaba rechazo');
      expect(result.error).toBe(SessionFailureKind.INVALID_TOKEN);
      expect(result.requiresReauthentication).toBe(true);
      expect(harness.audit.events).toEqual([
        {
          kind: SecurityAuditEventKind.TOKEN_REJECTED,
          occurredAt: harness.clock.now(),
          origin: '198.51.100.7',
          tokenKind: 'access',
          reason: TokenRejectionReason.INVALID_SIGNATURE
        }
      ]);
    });

    it('rechaza un refresh token alterado para extender su vigencia, sin tocar la cadena real', async () => {
      const harness = buildSessionHarness();
      const session = await login(harness);
      const forged = tamperPayload(session.refreshToken.value, { exp: 4_102_444_800 });

      const result = await harness.refresh.execute({ refreshToken: forged, origin: ORIGIN });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('Se esperaba rechazo');
      expect(result.error).toBe(SessionFailureKind.INVALID_TOKEN);
      expect(harness.audit.events.map((e) => e.reason)).toEqual([TokenRejectionReason.INVALID_SIGNATURE]);
      expect(await harness.refreshTokens.isChainRevoked(session.sessionId)).toBe(false);
    });

    it('rechaza un token firmado con otro secreto y lo registra', async () => {
      const attacker = buildSessionHarness({ env: { SESSION_SIGNING_SECRET: 'secreto-del-atacante-con-32-caracteres-o-mas' } });
      const victim = buildSessionHarness();
      const forged = await login(attacker);

      const result = await victim.verifyAccess.execute({ accessToken: forged.accessToken.value, origin: ORIGIN });

      expect(result.ok).toBe(false);
      expect(victim.audit.events).toHaveLength(1);
      expect(victim.audit.events[0]?.reason).toBe(TokenRejectionReason.INVALID_SIGNATURE);
      expect(TEST_SIGNING_SECRET).not.toBe(attacker.config.signingSecret);
    });

    it('rechaza basura que ni siquiera es un JWT y la registra como malformada', async () => {
      const harness = buildSessionHarness();

      const result = await harness.verifyAccess.execute({ accessToken: 'no-es-un-token', origin: ORIGIN });

      expect(result.ok).toBe(false);
      expect(harness.audit.events[0]).toMatchObject({
        kind: SecurityAuditEventKind.TOKEN_REJECTED,
        reason: TokenRejectionReason.MALFORMED
      });
    });

    it('el registro de auditoría nunca contiene el token presentado', async () => {
      const harness = buildSessionHarness();
      const session = await login(harness);
      const forged = tamperPayload(session.accessToken.value, { sub: 'otro@upb.edu.co' });

      await harness.verifyAccess.execute({ accessToken: forged, origin: ORIGIN });

      const logged = JSON.stringify(harness.audit.events);
      expect(logged).not.toContain(forged);
      expect(logged).not.toContain(forged.split('.')[2]);
    });
  });
});
