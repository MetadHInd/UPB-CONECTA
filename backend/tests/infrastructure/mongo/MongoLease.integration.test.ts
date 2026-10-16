import { MongoClient, type Db } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoLease, withLease } from '../../../src/infrastructure/shared/MongoLease.js';

const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
const DATABASE = process.env['MONGODB_TEST_DATABASE'] ?? 'upb_conecta_test';
const COLLECTION = 'scheduler_leases_test';
const JOB = 'ingesta';

describe('MongoLease (integración contra MongoDB real)', () => {
  let client: MongoClient;
  let db: Db;

  beforeAll(async () => {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DATABASE);
    await MongoLease.ensureIndexes(db, COLLECTION);
  });

  beforeEach(async () => {
    await db.collection(COLLECTION).deleteMany({});
  });

  afterAll(async () => {
    await db.collection(COLLECTION).drop().catch(() => undefined);
    await client.close();
  });

  const replica = (id: string) => new MongoLease(db, id, COLLECTION);

  it('la primera replica lo obtiene y la segunda no mientras este vigente', async () => {
    const a = replica('a');
    const b = replica('b');
    expect(await a.tryAcquire(JOB, 60_000)).toBe(true);
    expect(await b.tryAcquire(JOB, 60_000)).toBe(false);
  });

  it('el titular puede renovarlo', async () => {
    const a = replica('a');
    expect(await a.tryAcquire(JOB, 60_000)).toBe(true);
    expect(await a.tryAcquire(JOB, 60_000)).toBe(true);
  });

  it('otra replica lo toma al liberarse', async () => {
    const a = replica('a');
    const b = replica('b');
    await a.tryAcquire(JOB, 60_000);
    await a.release(JOB);
    expect(await b.tryAcquire(JOB, 60_000)).toBe(true);
  });

  it('otra replica lo toma si el titular murio y el arrendamiento vencio', async () => {
    const a = replica('a');
    const b = replica('b');
    await a.tryAcquire(JOB, 50);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(await b.tryAcquire(JOB, 60_000)).toBe(true);
    expect(await a.tryAcquire(JOB, 60_000)).toBe(false);
  });

  it('liberar no quita el arrendamiento de otra replica', async () => {
    const a = replica('a');
    const b = replica('b');
    await a.tryAcquire(JOB, 60_000);
    await b.release(JOB);
    expect(await b.tryAcquire(JOB, 60_000)).toBe(false);
  });

  it('trabajos distintos no se bloquean entre si', async () => {
    const a = replica('a');
    const b = replica('b');
    expect(await a.tryAcquire('ingesta', 60_000)).toBe(true);
    expect(await b.tryAcquire('avisos', 60_000)).toBe(true);
  });

  it('con muchas replicas compitiendo a la vez, exactamente una lo obtiene', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => replica(`r${i}`).tryAcquire(JOB, 60_000)));
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  describe('withLease', () => {
    it('ejecuta el caso de uso y libera el arrendamiento al terminar', async () => {
      const a = replica('a');
      let runs = 0;
      const guarded = withLease(a, JOB, 60_000, { execute: async () => ++runs });
      expect(await guarded.execute()).toBe(1);
      expect(await replica('b').tryAcquire(JOB, 60_000)).toBe(true);
    });

    it('omite el ciclo sin ejecutar nada si otra replica es titular', async () => {
      await replica('a').tryAcquire(JOB, 60_000);
      let runs = 0;
      let skipped = 0;
      const guarded = withLease(replica('b'), JOB, 60_000, { execute: async () => ++runs }, () => skipped++);
      expect(await guarded.execute()).toBeUndefined();
      expect(runs).toBe(0);
      expect(skipped).toBe(1);
    });

    it('libera el arrendamiento aunque el caso de uso falle', async () => {
      const guarded = withLease(replica('a'), JOB, 60_000, {
        execute: async () => {
          throw new Error('boom');
        }
      });
      await expect(guarded.execute()).rejects.toThrow('boom');
      expect(await replica('b').tryAcquire(JOB, 60_000)).toBe(true);
    });

    it('dos replicas con el mismo ciclo a la vez: solo una ejecuta', async () => {
      let concurrent = 0;
      let maxConcurrent = 0;
      let runs = 0;
      const slow = {
        execute: async () => {
          runs++;
          concurrent++;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          await new Promise((resolve) => setTimeout(resolve, 100));
          concurrent--;
        }
      };
      await Promise.all([withLease(replica('a'), JOB, 60_000, slow).execute(), withLease(replica('b'), JOB, 60_000, slow).execute()]);
      expect(runs).toBe(1);
      expect(maxConcurrent).toBe(1);
    });
  });
});
