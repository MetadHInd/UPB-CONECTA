import { MongoClient, type Db } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SimulateModerationThresholds } from '../../../src/contexts/moderation/application/SimulateModerationThresholds.js';
import { ModerationThresholds } from '../../../src/contexts/moderation/domain/value-objects/ModerationThresholds.js';
import { InMemoryModerationAdapter } from '../../../src/contexts/moderation/infrastructure/adapters/out/memory/InMemoryModerationAdapter.js';
import { MongoAutomaticModerationRecords } from '../../../src/contexts/moderation/infrastructure/adapters/out/mongo/MongoAutomaticModerationRecords.js';
import { MongoModerationLabeledSamples } from '../../../src/contexts/moderation/infrastructure/adapters/out/mongo/MongoModerationLabeledSamples.js';
import { MongoModerationRulesAudit } from '../../../src/contexts/moderation/infrastructure/adapters/out/mongo/MongoModerationRulesAudit.js';
import { MongoModerationRulesRepository } from '../../../src/contexts/moderation/infrastructure/adapters/out/mongo/MongoModerationRulesRepository.js';
import { buildForumHarness } from '../../forum/forumHarness.js';

const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
// Base propia: comparte nombres de coleccion con otras pruebas de integracion que corren en paralelo.
const DATABASE = `${process.env['MONGODB_TEST_DATABASE'] ?? 'upb_conecta_test'}_moderation_rules`;

const ANA = 'ana@upb.edu.co';
const ADMIN = 'moderacion@upb.edu.co';
const INITIAL = { thresholds: ModerationThresholds.of(0.4, 0.8), bannedTerms: ['idiota', 'hijo de puta'] };

describe('Reglas y registro de moderación sobre MongoDB — HU-52 (integración contra MongoDB real)', () => {
  let client: MongoClient;
  let db: Db;

  beforeAll(async () => {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DATABASE);
    await db.dropDatabase();
    await MongoModerationRulesAudit.ensureIndexes(db);
    await MongoAutomaticModerationRecords.ensureIndexes(db);
  });

  afterAll(async () => {
    await db.dropDatabase();
    await client.close();
  });

  it('ajusta reglas con auditoría, registra cada decisión y anexa la resolución humana con $push', async () => {
    const forum = buildForumHarness({
      moderationRules: new MongoModerationRulesRepository(db, INITIAL),
      moderationRulesAudit: new MongoModerationRulesAudit(db),
      moderationRecords: new MongoAutomaticModerationRecords(db)
    });
    await forum.seed.execute(forum.seedTopics);
    await forum.login('ana');

    // Sin documento rigen los valores iniciales.
    expect(await forum.manageModerationRules.get()).toMatchObject({ rules: INITIAL, updatedBy: null, updatedAt: null });

    await forum.manageModerationRules.updateThresholds({ lower: 0.3, performedBy: ADMIN });
    await forum.manageModerationRules.addBannedTerm({ term: 'gonorrea', performedBy: ADMIN });
    expect(await db.collection(MongoModerationRulesRepository.COLLECTION).findOne({ _id: 'current' as never })).toMatchObject({
      lower: 0.3,
      upper: 0.8,
      bannedTerms: ['idiota', 'hijo de puta', 'gonorrea'],
      updatedBy: ADMIN
    });
    expect((await forum.manageModerationRules.history()).map((change) => change.kind)).toEqual(['banned-term-added', 'thresholds-changed']);

    forum.moderationPort.script = { score: 0.35 };
    await forum.createPost.execute({ authorEmail: ANA, topicId: 'general', body: { title: 'Duda', text: 'Texto dudoso' } });
    const [pending] = await forum.retentionQueue.findPending();
    const [automatic] = await forum.moderationRecords.findByContentId(pending!.contentId);
    expect(automatic).toMatchObject({ score: 0.35, thresholds: { lower: 0.3, upper: 0.8 }, verdict: 'retain', resolutions: [] });

    await forum.rejectRetained.execute({ contentId: pending!.contentId, reviewer: ADMIN });

    const [stored] = await forum.moderationRecords.findByContentId(pending!.contentId);
    expect(stored).toEqual({ ...automatic, resolutions: [{ outcome: 'rejected', reviewer: ADMIN, category: 'other', resolvedAt: forum.now() }] });
    expect(await forum.moderationRecords.appendResolution('no-existe', stored!.resolutions[0]!)).toBe(false);

    const indexes = (await db.collection(MongoAutomaticModerationRecords.COLLECTION).indexes()).map((index) => index.name);
    expect(indexes).toContain('idx_content_decided');
  });

  it('un documento de reglas editado a mano con umbrales incoherentes falla al leerse', async () => {
    const rules = new MongoModerationRulesRepository(db, INITIAL, 'moderation_rules_corrupt');
    await db.collection('moderation_rules_corrupt').insertOne({ _id: 'current' as never, lower: 0.9, upper: 0.1, bannedTerms: [] });

    await expect(rules.get()).rejects.toThrow(/umbral inferior/);
  });

  it('simula sobre el conjunto etiquetado guardado en MongoDB', async () => {
    const samples = new MongoModerationLabeledSamples(db);
    await samples.save({ sampleId: 'b', text: 'malparido', offensive: true });
    await samples.save({ sampleId: 'a', text: 'hola a todos', offensive: false });
    await samples.save({ sampleId: 'a', text: 'hola a todos', offensive: false });

    expect((await samples.findAll()).map((sample) => sample.sampleId)).toEqual(['a', 'b']);
    const simulate = new SimulateModerationThresholds({
      moderation: new InMemoryModerationAdapter(),
      rules: new MongoModerationRulesRepository(db, INITIAL, 'moderation_rules_simulation'),
      samples,
      timeoutMs: 100
    });
    expect(await simulate.execute({ lower: 0.4, upper: 0.95 })).toMatchObject({
      ok: true,
      sampleSize: 2,
      proposed: { coverage: 1, falsePositiveRate: 0, offensive: { retain: 1 } }
    });
  });
});
