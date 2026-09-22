import { MongoClient, type Db } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { RefreshTokenRecord } from '../../../src/contexts/identity/domain/entities/RefreshTokenRecord.js';
import { SessionFailureKind } from '../../../src/contexts/identity/domain/entities/SessionResult.js';
import { MongoRefreshTokenRepository } from '../../../src/contexts/identity/infrastructure/adapters/out/mongo/MongoRefreshTokenRepository.js';
import { buildSessionHarness, login } from '../../identity/sessionHarness.js';

const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
const DATABASE = process.env['MONGODB_TEST_DATABASE'] ?? 'upb_conecta_test';
const TOKENS = 'identity_refresh_tokens_test';
const REVOKED = 'identity_revoked_sessions_test';

const T0 = new Date('2026-09-22T12:00:00Z');

function record(tokenId: string, chainId: string, overrides: Partial<RefreshTokenRecord> = {}): RefreshTokenRecord {
  return {
    tokenId,
    chainId,
    subject: 'estudiante@upb.edu.co',
    status: 'active',
    issuedAt: T0,
    expiresAt: new Date(T0.getTime() + 3_600_000),
    usedAt: null,
    revokedAt: null,
    revokedReason: null,
    ...overrides
  };
}

describe('MongoRefreshTokenRepository (integración contra MongoDB real)', () => {
  let client: MongoClient;
  let db: Db;
  let repository: MongoRefreshTokenRepository;

  beforeAll(async () => {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DATABASE);
    await MongoRefreshTokenRepository.ensureIndexes(db, TOKENS);
  });

  beforeEach(async () => {
    await db.collection(TOKENS).deleteMany({});
    await db.collection(REVOKED).deleteMany({});
    repository = new MongoRefreshTokenRepository(db, TOKENS, REVOKED);
  });

  afterAll(async () => {
    await db.collection(TOKENS).drop().catch(() => undefined);
    await db.collection(REVOKED).drop().catch(() => undefined);
    await client.close();
  });

  it('declara índice por cadena y TTL por expiración sobre los tokens', async () => {
    const indexes = await db.collection(TOKENS).indexes();

    expect(indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'idx_chain_status', key: { chainId: 1, status: 1 } }),
        expect.objectContaining({ name: 'ttl_expires_at', key: { expiresAt: 1 }, expireAfterSeconds: 0 })
      ])
    );
  });

  it('registra y recupera un token por su tokenId, usándolo como _id', async () => {
    await repository.register(record('t1', 'c1'));

    expect(await repository.findByTokenId('t1')).toEqual(record('t1', 'c1'));
    expect(await repository.findByTokenId('no-existe')).toBeNull();
    expect(await db.collection(TOKENS).findOne({ _id: 't1' as never })).not.toBeNull();
  });

  it('marca como usado de forma atómica: la segunda marca sobre el mismo token falla', async () => {
    await repository.register(record('t1', 'c1'));
    const at = new Date(T0.getTime() + 60_000);

    const results = await Promise.all([repository.markUsed('t1', at), repository.markUsed('t1', at)]);

    expect(results.sort()).toEqual([false, true]);
    expect(await repository.findByTokenId('t1')).toMatchObject({ status: 'used', usedAt: at });
  });

  it('revocar una cadena revoca todos sus tokens y no toca otras cadenas', async () => {
    await repository.register(record('t1', 'c1', { status: 'used', usedAt: T0 }));
    await repository.register(record('t2', 'c1', { status: 'used', usedAt: T0 }));
    await repository.register(record('t3', 'c1'));
    await repository.register(record('otro', 'c2'));
    const at = new Date(T0.getTime() + 120_000);

    await repository.revokeChain('c1', 'reuse-detected', at);

    for (const tokenId of ['t1', 't2', 't3']) {
      expect(await repository.findByTokenId(tokenId)).toMatchObject({
        status: 'revoked',
        revokedAt: at,
        revokedReason: 'reuse-detected'
      });
    }
    expect(await repository.findByTokenId('otro')).toMatchObject({ status: 'active' });
    expect(await repository.isChainRevoked('c1')).toBe(true);
    expect(await repository.isChainRevoked('c2')).toBe(false);
  });

  it('revocar dos veces conserva el primer motivo', async () => {
    await repository.register(record('t1', 'c1'));

    await repository.revokeChain('c1', 'reuse-detected', T0);
    await repository.revokeChain('c1', 'logout', new Date(T0.getTime() + 1000));

    expect(await repository.findByTokenId('t1')).toMatchObject({ revokedReason: 'reuse-detected', revokedAt: T0 });
    expect(await db.collection(REVOKED).findOne({ _id: 'c1' as never })).toMatchObject({ reason: 'reuse-detected' });
  });

  it('flujo completo sobre Mongo: 3 rotaciones y reuso a mitad de cadena invalida la cadena', async () => {
    const harness = buildSessionHarness({ refreshTokens: repository });
    const r1 = await login(harness);
    const chain = [r1];
    for (let i = 0; i < 3; i += 1) {
      const renewed = await harness.refresh.execute({ refreshToken: chain.at(-1)!.refreshToken.value, origin: 'o' });
      if (!renewed.ok) throw new Error(`rotación ${i + 1} fallida`);
      chain.push(renewed.tokens);
    }

    const reuse = await harness.refresh.execute({ refreshToken: chain[1]!.refreshToken.value, origin: 'o' });
    const current = await harness.refresh.execute({ refreshToken: chain[3]!.refreshToken.value, origin: 'o' });

    expect(reuse).toMatchObject({ ok: false, error: SessionFailureKind.REFRESH_TOKEN_REUSE });
    expect(current).toMatchObject({ ok: false, error: SessionFailureKind.SESSION_REVOKED });
    const statuses = await db.collection(TOKENS).find({ chainId: r1.sessionId }).map((d) => d['status']).toArray();
    expect(statuses).toEqual(['revoked', 'revoked', 'revoked', 'revoked']);
  });
});
