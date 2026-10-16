import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Collection, Db } from 'mongodb';

import type {
  IdentityCredentials,
  IdentityProfile,
  IdentityProviderPort
} from '../../../../domain/ports/out/IdentityProviderPort.js';
import { InvalidCredentialsError, ProviderUnavailableError } from '../../../../application/AuthenticateStudent.js';

const scrypt = promisify(scryptCallback) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export interface IdentityAccount {
  readonly username: string;
  readonly password: string;
  readonly profile: IdentityProfile;
}

interface IdentityUserDocument {
  /** Usuario normalizado (minusculas, sin espacios): clave natural de la cuenta. */
  _id: string;
  /** `scrypt$<salt hex>$<hash hex>` — la contrasena nunca se guarda en claro. */
  passwordHash: string;
  profile: IdentityProfile;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Directorio de cuentas sobre MongoDB (coleccion `identity_users`). Ocupa el
 * mismo lugar que `InMemoryIdentityProviderAdapter` mientras no exista el
 * directorio institucional real (`RealIdentityProviderAdapter`), pero las
 * cuentas sobreviven a reinicios y se pueden crear sin redesplegar.
 *
 * El rol de la cuenta NO vive aqui: sigue en `AccountRoleRepositoryPort`
 * (HU-46), que es la unica fuente de verdad del rol.
 */
export class MongoIdentityProviderAdapter implements IdentityProviderPort {
  static readonly COLLECTION = 'identity_users';

  private readonly collection: Collection<IdentityUserDocument>;

  constructor(db: Db, collectionName = MongoIdentityProviderAdapter.COLLECTION) {
    this.collection = db.collection<IdentityUserDocument>(collectionName);
  }

  async authenticate(credentials: IdentityCredentials): Promise<IdentityProfile> {
    let found: IdentityUserDocument | null;
    try {
      found = await this.collection.findOne({ _id: normalizeUsername(credentials.username) });
    } catch {
      throw new ProviderUnavailableError();
    }

    if (!found || !(await verifyPassword(credentials.password, found.passwordHash))) {
      throw new InvalidCredentialsError();
    }

    return { ...found.profile, email: found.profile.email.toLowerCase() };
  }

  /** Perfil de una cuenta sin verificar contrasena (para otros contextos, p. ej. mensajeria). */
  async findProfile(username: string): Promise<IdentityProfile | null> {
    const found = await this.collection.findOne({ _id: normalizeUsername(username) }, { projection: { profile: 1 } });
    return found ? { ...found.profile, email: found.profile.email.toLowerCase() } : null;
  }

  async listProfiles(): Promise<readonly IdentityProfile[]> {
    const docs = await this.collection.find({}, { projection: { profile: 1 } }).toArray();
    return docs.map((doc) => ({ ...doc.profile, email: doc.profile.email.toLowerCase() }));
  }

  /** Crea la cuenta o reemplaza contrasena y perfil si ya existia. */
  async register(account: IdentityAccount): Promise<void> {
    const now = new Date();
    await this.collection.updateOne(
      { _id: normalizeUsername(account.username) },
      {
        $set: { passwordHash: await hashPassword(account.password), profile: account.profile, updatedAt: now },
        $setOnInsert: { createdAt: now }
      },
      { upsert: true }
    );
  }

  /** Crea la cuenta solo si no existe; devuelve `true` si la creo. Nunca pisa una contrasena cambiada a mano. */
  async registerIfAbsent(account: IdentityAccount): Promise<boolean> {
    const now = new Date();
    const result = await this.collection.updateOne(
      { _id: normalizeUsername(account.username) },
      {
        $setOnInsert: {
          passwordHash: await hashPassword(account.password),
          profile: account.profile,
          createdAt: now,
          updatedAt: now
        }
      },
      { upsert: true }
    );
    return result.upsertedCount === 1;
  }
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const hash = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
