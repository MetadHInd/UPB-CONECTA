import { describe, expect, it } from 'vitest';
import type { RefreshTokenRecord } from '../../src/contexts/identity/domain/entities/RefreshTokenRecord.js';
import { ANA, LUIS, buildDataRightsHarness } from './dataRightsHarness.js';

const at = new Date('2026-09-22T12:00:00Z');
const token = (tokenId: string, chainId: string, subject: string): RefreshTokenRecord => ({
  tokenId,
  chainId,
  subject,
  status: 'active',
  issuedAt: at,
  expiresAt: new Date('2026-10-22T12:00:00Z'),
  usedAt: null,
  revokedAt: null,
  revokedReason: null
});

describe('HU-48 + HU-39/45 — la supresión de datos invalida las sesiones del titular', () => {
  it('revoca todas las cadenas de refresh token del titular y no toca las de otros', async () => {
    const h = buildDataRightsHarness();
    await h.populate(ANA);
    await h.refreshTokens.register(token('t-1', 'chain-a1', ANA));
    await h.refreshTokens.register(token('t-2', 'chain-a2', ANA));
    await h.refreshTokens.register(token('t-3', 'chain-l1', LUIS));

    const result = await h.erase.execute({ subject: ANA });

    expect(result.status).toBe('completed');
    expect((await h.refreshTokens.findByTokenId('t-1'))?.status).toBe('revoked');
    expect((await h.refreshTokens.findByTokenId('t-1'))?.revokedReason).toBe('data-erasure');
    expect((await h.refreshTokens.findByTokenId('t-2'))?.status).toBe('revoked');
    expect((await h.refreshTokens.findByTokenId('t-3'))?.status).toBe('active');
    expect(await h.refreshTokens.isChainRevoked('chain-l1')).toBe(false);
  });

  it('si una fuente de datos falla, las sesiones ya quedaron revocadas y el reintento sigue funcionando', async () => {
    const h = buildDataRightsHarness({ flaky: 'devices' });
    await h.populate(ANA);
    await h.refreshTokens.register(token('t-1', 'chain-a1', ANA));

    await h.erase.execute({ subject: ANA });

    expect((await h.refreshTokens.findByTokenId('t-1'))?.status).toBe('revoked');
    h.flaky!.failing = false;
    await h.processPending.execute();
    expect((await h.refreshTokens.findByTokenId('t-1'))?.status).toBe('revoked');
  });
});
