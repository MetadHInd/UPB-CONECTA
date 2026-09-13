import { MongoClient, type Db } from 'mongodb';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { MongoConsentRepository } from '../../../src/contexts/consent/infrastructure/adapters/out/mongo/MongoConsentRepository.js';

const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
const DATABASE = process.env['MONGODB_TEST_DATABASE'] ?? 'upb_conecta_test';
const COLLECTION = 'consent_records';

/**
 * HU-44: append-only sobre MongoDB real. Un mock del driver no ejerceria
 * que `record()` use `insertOne` (nunca upsert) ni que el orden por
 * `acceptedAt` funcione sobre documentos reales.
 */
describe('MongoConsentRepository (integración contra MongoDB real)', () => {
  let client: MongoClient;
  let db: Db;
  let repository: MongoConsentRepository;

  beforeAll(async () => {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DATABASE);
    await MongoConsentRepository.ensureIndexes(db);
  });

  beforeEach(async () => {
    await db.collection(COLLECTION).deleteMany({});
    repository = new MongoConsentRepository(db);
  });

  afterAll(async () => {
    await db.collection(COLLECTION).drop().catch(() => undefined);
    await client.close();
  });

  it('un estudiante sin aceptaciones no tiene consentimiento mas reciente', async () => {
    expect(await repository.findLatest('est-1', 'privacy-policy')).toBeNull();
    expect(await repository.findHistory('est-1', 'privacy-policy')).toEqual([]);
  });

  it('registra una aceptacion y la recupera como la mas reciente', async () => {
    await repository.record({
      studentId: 'est-1',
      documentType: 'privacy-policy',
      version: 'v1',
      acceptedAt: new Date('2026-01-01T10:00:00Z')
    });

    const latest = await repository.findLatest('est-1', 'privacy-policy');
    expect(latest?.version).toBe('v1');
  });

  it('append-only: dos aceptaciones del mismo estudiante generan dos documentos, no un upsert', async () => {
    await repository.record({
      studentId: 'est-1',
      documentType: 'privacy-policy',
      version: 'v1',
      acceptedAt: new Date('2026-01-01T10:00:00Z')
    });
    await repository.record({
      studentId: 'est-1',
      documentType: 'privacy-policy',
      version: 'v2',
      acceptedAt: new Date('2026-02-01T10:00:00Z')
    });

    const count = await db.collection(COLLECTION).countDocuments({ studentId: 'est-1', documentType: 'privacy-policy' });
    expect(count).toBe(2);

    const latest = await repository.findLatest('est-1', 'privacy-policy');
    expect(latest?.version).toBe('v2');

    const history = await repository.findHistory('est-1', 'privacy-policy');
    expect(history.map((r) => r.version)).toEqual(['v2', 'v1']);
  });

  it('mantiene historiales independientes por tipo de documento', async () => {
    await repository.record({
      studentId: 'est-1',
      documentType: 'privacy-policy',
      version: 'v1',
      acceptedAt: new Date('2026-01-01T10:00:00Z')
    });

    expect(await repository.findLatest('est-1', 'forum-guidelines')).toBeNull();
  });

  it('crea el indice declarado por el adaptador', async () => {
    const indexes = await db.collection(COLLECTION).indexes();
    expect(indexes.some((index) => index.name === 'idx_student_document_acceptedAt')).toBe(true);
  });
});
