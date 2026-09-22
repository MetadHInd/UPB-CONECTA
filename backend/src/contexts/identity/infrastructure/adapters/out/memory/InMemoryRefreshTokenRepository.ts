import type { RefreshTokenRecord, RefreshTokenRevocationReason } from '../../../../domain/entities/RefreshTokenRecord.js';
import type { RefreshTokenRepositoryPort } from '../../../../domain/ports/out/RefreshTokenRepositoryPort.js';

export class InMemoryRefreshTokenRepository implements RefreshTokenRepositoryPort {
  private readonly tokens = new Map<string, RefreshTokenRecord>();
  private readonly revokedChains = new Set<string>();

  async register(record: RefreshTokenRecord): Promise<void> {
    this.tokens.set(record.tokenId, record);
  }

  async findByTokenId(tokenId: string): Promise<RefreshTokenRecord | null> {
    return this.tokens.get(tokenId) ?? null;
  }

  async markUsed(tokenId: string, at: Date): Promise<boolean> {
    const record = this.tokens.get(tokenId);
    if (record === undefined || record.status !== 'active') return false;
    this.tokens.set(tokenId, { ...record, status: 'used', usedAt: at });
    return true;
  }

  async revokeChain(chainId: string, reason: RefreshTokenRevocationReason, at: Date): Promise<void> {
    this.revokedChains.add(chainId);
    for (const record of this.tokens.values()) {
      if (record.chainId === chainId && record.status !== 'revoked') {
        this.tokens.set(record.tokenId, { ...record, status: 'revoked', revokedAt: at, revokedReason: reason });
      }
    }
  }

  async isChainRevoked(chainId: string): Promise<boolean> {
    return this.revokedChains.has(chainId);
  }
}
