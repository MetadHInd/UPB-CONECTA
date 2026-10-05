import { MongoClient, type Db } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoForumAuthorRepository } from '../../src/contexts/forum/infrastructure/adapters/out/mongo/MongoForumAuthorRepository.js';
import { MongoPostRepository } from '../../src/contexts/forum/infrastructure/adapters/out/mongo/MongoPostRepository.js';
import { MongoTopicRepository } from '../../src/contexts/forum/infrastructure/adapters/out/mongo/MongoTopicRepository.js';
import { buildForumHarness } from './forumHarness.js';

const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
const DATABASE = process.env['MONGODB_TEST_DATABASE'] ?? 'upb_conecta_test';
const C = {
  topics: 'perf_hu55_resilience_forum_topics',
  posts: 'perf_hu55_resilience_forum_posts',
  authors: 'perf_hu55_resilience_forum_authors'
};

/**
 * HU-55, criterio 6 (segunda mitad): "no se pierde ... una publicacion
 * enviada por un estudiante" ante cualquier interrupcion del proceso.
 *
 * `CreatePost.execute` termina con `await posts.save(post)`, y
 * `MongoPostRepository.save` usa `insertOne` (escritura reconocida por
 * defecto: la promesa solo se resuelve cuando MongoDB confirmo la escritura).
 * Eso significa que, para el momento en que `save` retorna, la publicacion ya
 * es tan durable como el propio MongoDB — el mismo riesgo que HU-55 criterio
 * 4 ya cubrio para lo consolidado por la ingesta. No se identifico ningun
 * caso real donde esa escritura confirmada se pierda (no hay `insertMany`
 * sin `ordered`, ni escritura fire-and-forget, ni buffer en memoria antes de
 * persistir), asi que esta prueba demuestra la garantia existente en vez de
 * agregar codigo que no hace falta: guarda la publicacion, descarta la
 * instancia (cliente, repositorio, caso de uso) que la escribio — simulando
 * que el proceso "cae" justo despues de que Mongo confirmo el `insertOne` y
 * antes de que el cliente HTTP reciba la respuesta — y la busca de nuevo con
 * una conexion y un repositorio completamente nuevos.
 */
describe('HU-55 criterio 6 — una publicacion del foro no se pierde ante una interrupcion del proceso', () => {
  let client: MongoClient;
  let db: Db;

  beforeAll(async () => {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DATABASE);
    await MongoTopicRepository.ensureIndexes(db, C.topics);
    await MongoPostRepository.ensureIndexes(db, C.posts);
  });

  afterAll(async () => {
    for (const name of Object.values(C)) await db.collection(name).drop().catch(() => undefined);
    await client.close();
  });

  it('una publicacion sobrevive aunque el proceso que la guardo se descarte justo despues de la confirmacion de Mongo', async () => {
    const forum = buildForumHarness({
      topics: new MongoTopicRepository(db, C.topics),
      posts: new MongoPostRepository(db, C.posts),
      authors: new MongoForumAuthorRepository(db, C.authors)
    });
    await forum.seed.execute(forum.seedTopics);
    await forum.login('ana');

    const result = await forum.createPost.execute({
      authorEmail: 'ana@upb.edu.co',
      topicId: 'general',
      body: { title: 'Aviso de prueba', text: 'HU-55 criterio 6: verificacion de resiliencia del foro.' }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('la publicacion de prueba deberia haberse aceptado');
    const publishedPostId = result.post.id;

    // "Cae" el proceso: se descarta por completo la instancia que escribio
    // (el caso de uso, el repositorio, el harness) sin volver a tocarla. Lo
    // unico que sobrevive de esta prueba es lo que ya esta en MongoDB.

    // Un nuevo proceso (nueva conexion, nuevo repositorio, nada compartido en
    // memoria con la escritura original) la vuelve a encontrar.
    const freshClient = new MongoClient(MONGODB_URI);
    await freshClient.connect();
    try {
      const freshPosts = new MongoPostRepository(freshClient.db(DATABASE), C.posts);
      const survivors = await freshPosts.findByTopic('general');
      const survivor = survivors.find((p) => p.id === publishedPostId);

      expect(survivor).toBeDefined();
      expect(survivor).toMatchObject({
        id: publishedPostId,
        topicId: 'general',
        title: 'Aviso de prueba',
        text: 'HU-55 criterio 6: verificacion de resiliencia del foro.',
        author: { email: 'ana@upb.edu.co' }
      });
    } finally {
      await freshClient.close();
    }
  });
});
