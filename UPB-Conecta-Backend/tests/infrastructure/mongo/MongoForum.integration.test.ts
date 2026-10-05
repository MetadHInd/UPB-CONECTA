import { MongoClient, type Db } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PostRejectionKind } from '../../../src/contexts/forum/application/CreatePost.js';
import type { Topic } from '../../../src/contexts/forum/domain/entities/Topic.js';
import { MongoForumAccessAuditLog } from '../../../src/contexts/forum/infrastructure/adapters/out/mongo/MongoForumAccessAuditLog.js';
import { MongoForumAuthorRepository } from '../../../src/contexts/forum/infrastructure/adapters/out/mongo/MongoForumAuthorRepository.js';
import { MongoPostRepository } from '../../../src/contexts/forum/infrastructure/adapters/out/mongo/MongoPostRepository.js';
import { MongoTopicRepository } from '../../../src/contexts/forum/infrastructure/adapters/out/mongo/MongoTopicRepository.js';
import { facultyTargeting, programTargeting } from '../../../src/contexts/targeting/domain/value-objects/ProgramTargeting.js';
import { buildForumHarness } from '../../forum/forumHarness.js';

const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
const DATABASE = process.env['MONGODB_TEST_DATABASE'] ?? 'upb_conecta_test';
const C = { topics: 'forum_topics_test', posts: 'forum_posts_test', authors: 'forum_authors_test', audit: 'forum_access_audit_test' };
const T0 = new Date('2026-09-22T12:00:00Z');

const topic = (overrides: Partial<Topic> = {}): Topic => ({
  id: 'semilleros',
  name: 'Semilleros',
  description: 'Investigación',
  restriction: facultyTargeting('ingenieria'),
  status: 'active',
  createdAt: T0,
  updatedAt: T0,
  updatedBy: 'admin@upb.edu.co',
  ...overrides
});

describe('Adaptadores Mongo del foro (integración contra MongoDB real)', () => {
  let client: MongoClient;
  let db: Db;

  beforeAll(async () => {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DATABASE);
    await MongoTopicRepository.ensureIndexes(db, C.topics);
    await MongoPostRepository.ensureIndexes(db, C.posts);
    await MongoForumAccessAuditLog.ensureIndexes(db, C.audit);
  });

  beforeEach(async () => {
    for (const name of Object.values(C)) await db.collection(name).deleteMany({});
  });

  afterAll(async () => {
    for (const name of Object.values(C)) await db.collection(name).drop().catch(() => undefined);
    await client.close();
  });

  describe('MongoTopicRepository', () => {
    it('crea, no duplica, actualiza y distingue activos de retirados', async () => {
      const topics = new MongoTopicRepository(db, C.topics);

      expect(await topics.create(topic())).toBe(true);
      expect(await topics.create(topic({ name: 'Otro' }))).toBe(false);
      expect(await topics.findById('semilleros')).toEqual(topic());

      await topics.create(topic({ id: 'general', name: 'General', restriction: { kind: 'all-community' } }));
      await topics.update(topic({ status: 'retired', restriction: programTargeting(['sistemas']) }));

      expect((await topics.findActive()).map((t) => t.id)).toEqual(['general']);
      expect((await topics.findAll()).map((t) => t.id)).toEqual(['general', 'semilleros']);
      expect(await topics.findById('semilleros')).toMatchObject({ status: 'retired', restriction: { kind: 'programs', programIds: ['sistemas'] } });
      expect(await topics.findById('no-existe')).toBeNull();
    });

    it('declara el índice por estado y nombre', async () => {
      expect(await db.collection(C.topics).indexes()).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'idx_status_name', key: { status: 1, name: 1 } })])
      );
    });
  });

  describe('MongoPostRepository', () => {
    it('lista las publicaciones de un tema, la más reciente primero', async () => {
      const posts = new MongoPostRepository(db, C.posts);
      const author = { email: 'ana@upb.edu.co', name: 'Ana Gómez', programName: 'Ingeniería de Sistemas', programId: 'sistemas' };
      await posts.save({ id: 'p1', topicId: 'general', author, title: 'Primero', text: 'a', publishedAt: T0 });
      await posts.save({ id: 'p2', topicId: 'general', author, title: 'Segundo', text: 'b', publishedAt: new Date(T0.getTime() + 1000) });
      await posts.save({ id: 'p3', topicId: 'otro', author, title: 'Otro', text: 'c', publishedAt: T0 });

      const found = await posts.findByTopic('general');

      expect(found.map((p) => p.id)).toEqual(['p2', 'p1']);
      expect(found[1]).toEqual({ id: 'p1', topicId: 'general', author, title: 'Primero', text: 'a', publishedAt: T0 });
      expect(await db.collection(C.posts).indexes()).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'idx_topic_published', key: { topicId: 1, publishedAt: -1 } })])
      );
    });
  });

  describe('MongoForumAuthorRepository', () => {
    it('guarda solo nombre, programa y id de programa, y reemplaza en cada sincronización', async () => {
      const authors = new MongoForumAuthorRepository(db, C.authors);
      await authors.save({ email: 'ana@upb.edu.co', name: 'Ana', programName: 'Sistemas', programId: 'sistemas', syncedAt: T0 });
      await authors.save({ email: 'ana@upb.edu.co', name: 'Ana María', programName: 'Astrofísica', programId: null, syncedAt: T0 });

      expect(await db.collection(C.authors).findOne({ _id: 'ana@upb.edu.co' as never })).toEqual({
        _id: 'ana@upb.edu.co',
        name: 'Ana María',
        programName: 'Astrofísica',
        programId: null,
        syncedAt: T0
      });
      expect(await authors.findByEmail('nadie@upb.edu.co')).toBeNull();
    });
  });

  describe('MongoForumAccessAuditLog', () => {
    it('es append-only: dos intentos iguales son dos eventos', async () => {
      const audit = new MongoForumAccessAuditLog(db, C.audit);
      const event = {
        kind: 'topic-access-denied' as const,
        operation: 'publish' as const,
        studentEmail: 'luis@upb.edu.co',
        studentProgramId: 'psicologia',
        topicId: 'semilleros',
        occurredAt: T0
      };

      await audit.record(event);
      await audit.record(event);

      const stored = await db.collection(C.audit).find({}, { projection: { _id: 0 } }).toArray();
      expect(stored).toEqual([event, event]);
    });
  });

  it('flujo completo sobre Mongo: siembra, login, publicación verificada y rechazo auditado en tema restringido', async () => {
    const forum = buildForumHarness({
      topics: new MongoTopicRepository(db, C.topics),
      posts: new MongoPostRepository(db, C.posts),
      authors: new MongoForumAuthorRepository(db, C.authors)
    });
    await forum.seed.execute(forum.seedTopics);
    await forum.manage.create({ name: 'Semilleros de Sistemas', description: '', restriction: programTargeting(['sistemas']), performedBy: 'admin' });
    await forum.login('ana');
    await forum.login('luis');

    const ok = await forum.createPost.execute({ authorEmail: 'ana@upb.edu.co', topicId: 'semilleros-de-sistemas', body: { title: 'Hola', text: 'Reunión el jueves' } });
    const denied = await forum.createPost.execute({ authorEmail: 'luis@upb.edu.co', topicId: 'semilleros-de-sistemas', body: { title: 'Hola', text: 'x' } });

    expect(ok).toMatchObject({ ok: true, post: { author: { name: 'Ana Gómez', program: 'Ingeniería de Sistemas' } } });
    expect(denied).toMatchObject({ ok: false, error: PostRejectionKind.TOPIC_RESTRICTED });
    expect(forum.audit.events).toHaveLength(1);
    expect(await db.collection(C.posts).countDocuments({ topicId: 'semilleros-de-sistemas' })).toBe(1);
    expect(await db.collection(C.topics).countDocuments()).toBe(5);
  });
});
