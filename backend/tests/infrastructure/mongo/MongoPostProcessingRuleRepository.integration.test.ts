import { MongoClient, type Db } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MessageCategory } from '../../../src/contexts/classification/domain/value-objects/MessageCategory.js';
import type { PostProcessingRuleData } from '../../../src/contexts/classification/domain/rules/PostProcessingRuleData.js';
import { MongoPostProcessingRuleRepository } from '../../../src/contexts/classification/infrastructure/adapters/out/mongo/MongoPostProcessingRuleRepository.js';

const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
const DATABASE = process.env['MONGODB_TEST_DATABASE'] ?? 'upb_conecta_test';
const COLLECTION = 'post_processing_rules_test';

function buildRule(overrides: Partial<PostProcessingRuleData> = {}): PostProcessingRuleData {
  return {
    id: 'r-1',
    precedence: 10,
    active: true,
    condition: { type: 'sender-matches', pattern: '^bienestar@' },
    action: { type: 'correct', category: MessageCategory.BOLETIN_INFORMATIVO },
    ...overrides
  };
}

describe('MongoPostProcessingRuleRepository (integración contra MongoDB real)', () => {
  let client: MongoClient;
  let db: Db;
  let repository: MongoPostProcessingRuleRepository;

  beforeAll(async () => {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DATABASE);
  });

  beforeEach(async () => {
    await db.collection(COLLECTION).deleteMany({});
    repository = new MongoPostProcessingRuleRepository(db, COLLECTION);
  });

  afterAll(async () => {
    await db.collection(COLLECTION).drop().catch(() => undefined);
    await client.close();
  });

  it('guarda y recupera una regla por id (add/edit sin redespliegue, criterio 5)', async () => {
    await repository.save(buildRule());

    const found = await repository.findById('r-1');

    expect(found).toEqual(buildRule());
  });

  it('hace upsert: guardar de nuevo con el mismo id reemplaza la version anterior', async () => {
    await repository.save(buildRule());
    await repository.save(buildRule({ precedence: 99, action: { type: 'discard' } }));

    const all = await repository.findAll();

    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ precedence: 99, action: { type: 'discard' } });
  });

  it('findActiveRules solo devuelve reglas activas', async () => {
    await repository.save(buildRule({ id: 'r-activa', active: true }));
    await repository.save(buildRule({ id: 'r-inactiva', active: false }));

    const active = await repository.findActiveRules();

    expect(active.map((rule) => rule.id)).toEqual(['r-activa']);
  });

  it('setActive desactiva una regla sin borrarla (criterio 5)', async () => {
    await repository.save(buildRule({ id: 'r-1', active: true }));

    await repository.setActive('r-1', false);

    const found = await repository.findById('r-1');
    expect(found?.active).toBe(false);

    const active = await repository.findActiveRules();
    expect(active).toHaveLength(0);
  });

  it('findById devuelve null cuando la regla no existe', async () => {
    const found = await repository.findById('no-existe');
    expect(found).toBeNull();
  });

  it('ensureIndexes crea el indice compuesto sobre active y precedence', async () => {
    await MongoPostProcessingRuleRepository.ensureIndexes(db, COLLECTION);

    const indexes = await db.collection(COLLECTION).indexes();

    expect(indexes.some((index) => index.name === 'idx_active_precedence')).toBe(true);
  });
});
