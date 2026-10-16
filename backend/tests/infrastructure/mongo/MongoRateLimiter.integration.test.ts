import { MongoClient, type Db } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoRateLimiter } from '../../../src/contexts/identity/infrastructure/adapters/out/mongo/MongoRateLimiter.js';
import type { IdentityRateLimitConfig } from '../../../src/contexts/identity/infrastructure/config/IdentityRateLimitConfig.js';

const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
const DATABASE = process.env['MONGODB_TEST_DATABASE'] ?? 'upb_conecta_test';
const COLLECTION = 'identity_login_failures_test';

const CONFIG: IdentityRateLimitConfig = { windowMs: 60_000, maxAttemptsPerAccount: 3, maxAttemptsPerOrigin: 5 };

describe('MongoRateLimiter (integración contra MongoDB real)', () => {
  let client: MongoClient;
  let db: Db;

  beforeAll(async () => {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DATABASE);
    await MongoRateLimiter.ensureIndexes(db, COLLECTION);
  });

  beforeEach(async () => {
    await db.collection(COLLECTION).deleteMany({});
  });

  afterAll(async () => {
    await db.collection(COLLECTION).drop().catch(() => undefined);
    await client.close();
  });

  const limiter = (config = CONFIG) => new MongoRateLimiter(db, config, COLLECTION);

  it('permite intentos mientras no se alcance el limite por cuenta', async () => {
    const l = limiter();
    await l.recordFailure('ana@upb.edu.co', '10.0.0.1');
    await l.recordFailure('ana@upb.edu.co', '10.0.0.1');
    expect(await l.checkAllowed('ana@upb.edu.co', '10.0.0.1')).toBe(true);
  });

  it('bloquea la cuenta al llegar al maximo, sin afectar a otra cuenta de otro origen', async () => {
    const l = limiter();
    for (let i = 0; i < 3; i++) await l.recordFailure('ana@upb.edu.co', `10.0.0.${i}`);
    expect(await l.checkAllowed('ana@upb.edu.co', '10.9.9.9')).toBe(false);
    expect(await l.checkAllowed('luis@upb.edu.co', '10.9.9.9')).toBe(true);
  });

  it('normaliza mayusculas y espacios en cuenta y origen', async () => {
    const l = limiter();
    for (let i = 0; i < 3; i++) await l.recordFailure(' ANA@upb.edu.co ', '10.0.0.1');
    expect(await l.checkAllowed('ana@upb.edu.co', '10.0.0.2')).toBe(false);
  });

  it('bloquea el origen al llegar a su maximo aunque las cuentas sean distintas', async () => {
    const l = limiter();
    for (let i = 0; i < 5; i++) await l.recordFailure(`cuenta${i}@upb.edu.co`, '10.0.0.1');
    expect(await l.checkAllowed('otra@upb.edu.co', '10.0.0.1')).toBe(false);
  });

  it('un login correcto limpia los intentos de esa cuenta y origen', async () => {
    const l = limiter();
    for (let i = 0; i < 3; i++) await l.recordFailure('ana@upb.edu.co', '10.0.0.1');
    expect(await l.checkAllowed('ana@upb.edu.co', '10.0.0.1')).toBe(false);
    await l.recordSuccess('ana@upb.edu.co', '10.0.0.1');
    expect(await l.checkAllowed('ana@upb.edu.co', '10.0.0.1')).toBe(true);
  });

  it('ignora los intentos fuera de la ventana', async () => {
    const l = limiter({ ...CONFIG, windowMs: 100 });
    for (let i = 0; i < 3; i++) await l.recordFailure('ana@upb.edu.co', '10.0.0.1');
    expect(await l.checkAllowed('ana@upb.edu.co', '10.0.0.1')).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(await l.checkAllowed('ana@upb.edu.co', '10.0.0.1')).toBe(true);
  });

  it('comparte el conteo entre dos instancias (dos replicas de la API)', async () => {
    const replicaA = limiter();
    const replicaB = limiter();
    await replicaA.recordFailure('ana@upb.edu.co', '10.0.0.1');
    await replicaB.recordFailure('ana@upb.edu.co', '10.0.0.2');
    await replicaA.recordFailure('ana@upb.edu.co', '10.0.0.3');
    expect(await replicaB.checkAllowed('ana@upb.edu.co', '10.0.0.4')).toBe(false);
    expect(await replicaA.checkAllowed('ana@upb.edu.co', '10.0.0.4')).toBe(false);
  });
});
