import type { Collection, Db } from 'mongodb';
import type {
  RefreshTokenRecord,
  RefreshTokenRevocationReason,
  RefreshTokenStatus
} from '../../../../domain/entities/RefreshTokenRecord.js';
import type { RefreshTokenRepositoryPort } from '../../../../domain/ports/out/RefreshTokenRepositoryPort.js';

interface RefreshTokenDocument {
  _id: string;
  chainId: string;
  subject: string;
  status: RefreshTokenStatus;
  issuedAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
  revokedReason: RefreshTokenRevocationReason | null;
}

interface RevokedSessionDocument {
  _id: string;
  reason: RefreshTokenRevocationReason;
  revokedAt: Date;
}

function toRecord(doc: RefreshTokenDocument): RefreshTokenRecord {
  const { _id, ...rest } = doc;
  return { tokenId: _id, ...rest };
}

/**
 * Cadena de refresh tokens sobre MongoDB (HU-45). `_id = tokenId` (claim
 * `jti`); el token firmado nunca se guarda. La marca de cadena revocada vive
 * en su propia coleccion con `_id = chainId`, de modo que el upsert es la
 * operacion idempotente que conserva el primer motivo.
 */
export class MongoRefreshTokenRepository implements RefreshTokenRepositoryPort {
  static readonly TOKENS_COLLECTION = 'identity_refresh_tokens';
  static readonly REVOKED_COLLECTION = 'identity_revoked_sessions';

  private readonly tokens: Collection<RefreshTokenDocument>;
  private readonly revoked: Collection<RevokedSessionDocument>;

  constructor(
    db: Db,
    tokensCollection = MongoRefreshTokenRepository.TOKENS_COLLECTION,
    revokedCollection = MongoRefreshTokenRepository.REVOKED_COLLECTION
  ) {
    this.tokens = db.collection<RefreshTokenDocument>(tokensCollection);
    this.revoked = db.collection<RevokedSessionDocument>(revokedCollection);
  }

  /**
   * `idx_chain_status` sirve a `revokeChain` (todos los tokens de una cadena).
   * `ttl_expires_at` purga los tokens vencidos: un token expirado ya no pasa la
   * verificacion de firma, asi que su registro no aporta a la deteccion de reuso.
   * La coleccion de cadenas revocadas solo se consulta por `_id` y no necesita
   * indices propios.
   */
  static async ensureIndexes(db: Db, tokensCollection = MongoRefreshTokenRepository.TOKENS_COLLECTION): Promise<void> {
    const tokens = db.collection(tokensCollection);
    await tokens.createIndex({ chainId: 1, status: 1 }, { name: 'idx_chain_status' });
    await tokens.createIndex({ expiresAt: 1 }, { name: 'ttl_expires_at', expireAfterSeconds: 0 });
  }

  async register(record: RefreshTokenRecord): Promise<void> {
    const { tokenId, ...rest } = record;
    await this.tokens.insertOne({ _id: tokenId, ...rest });
  }

  async findByTokenId(tokenId: string): Promise<RefreshTokenRecord | null> {
    const doc = await this.tokens.findOne({ _id: tokenId });
    return doc === null ? null : toRecord(doc);
  }

  async markUsed(tokenId: string, at: Date): Promise<boolean> {
    // El filtro por `status: 'active'` hace la transicion atomica en el servidor.
    const result = await this.tokens.updateOne(
      { _id: tokenId, status: 'active' },
      { $set: { status: 'used', usedAt: at } }
    );
    return result.modifiedCount === 1;
  }

  async revokeChain(chainId: string, reason: RefreshTokenRevocationReason, at: Date): Promise<void> {
    await this.revoked.updateOne(
      { _id: chainId },
      { $setOnInsert: { reason, revokedAt: at } },
      { upsert: true }
    );
    await this.tokens.updateMany(
      { chainId, status: { $ne: 'revoked' } },
      { $set: { status: 'revoked', revokedAt: at, revokedReason: reason } }
    );
  }

  async isChainRevoked(chainId: string): Promise<boolean> {
    return (await this.revoked.countDocuments({ _id: chainId }, { limit: 1 })) > 0;
  }
}
