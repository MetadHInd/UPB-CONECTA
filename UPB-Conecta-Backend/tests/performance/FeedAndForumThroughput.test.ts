import { MongoClient, type Db } from 'mongodb';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GetSegmentedFeed } from '../../src/contexts/feed/application/GetSegmentedFeed.js';
import { MongoConvocatoriaRepository } from '../../src/contexts/feed/infrastructure/adapters/out/mongo/MongoConvocatoriaRepository.js';
import { MongoProgramTargetingRepository } from '../../src/contexts/targeting/infrastructure/adapters/out/mongo/MongoProgramTargetingRepository.js';
import { FacultyProgramResolver } from '../../src/contexts/targeting/domain/services/FacultyProgramResolver.js';
import { MongoPostRepository } from '../../src/contexts/forum/infrastructure/adapters/out/mongo/MongoPostRepository.js';

const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
const DATABASE = process.env['MONGODB_TEST_DATABASE'] ?? 'upb_conecta_test';
const DOCS = 20_000;

// HU-55, criterio 2: la historia no fija un numero para este caso (a
// diferencia del criterio 1, que exige "por debajo de 2 segundos" para 3.000
// usuarios/300 sesiones concurrentes). Se usa ese mismo umbral como
// referencia razonable: la consulta segmentada del feed y el listado de un
// tema del foro son operaciones de lectura puntuales de un solo estudiante,
// no deberian ser mas lentas que el presupuesto que la propia historia ya
// acepta para el caso de carga concurrente.
const BUDGET_MS = 2_000;

/**
 * HU-55, criterio 2: "Dado un repositorio con 20.000 documentos, cuando se
 * consulta el feed y el foro, entonces los tiempos se conservan apoyados en
 * indices sobre programa, tema y fecha."
 *
 * A diferencia de `tests/performance/SegmentedFeedThroughput.test.ts` (HU-12,
 * criterio 5/6), que mide una consulta Mongo escrita a mano dentro del propio
 * test, esta prueba ejercita el camino real de produccion:
 * `MongoConvocatoriaRepository` + `GetSegmentedFeed` (con
 * `MongoProgramTargetingRepository` real) y `MongoPostRepository`, contra
 * MongoDB real, sin mocks. Esto es lo que expuso el hallazgo documentado en
 * `src/contexts/feed/README.md`: `findSegmentedFeed` traia TODA la coleccion
 * sin filtrar (ignorando `profile`) y `GetSegmentedFeed.execute` resolvia
 * targeting con una consulta `findByMessageId` por cada entrada dentro del
 * loop (con 20k documentos, decenas de miles de consultas secuenciales).
 */
describe('HU-55 criterio 2 — feed y foro con 20k documentos, apoyados en indices', () => {
  let client: MongoClient;
  let db: Db;

  const CONSOLIDATED = 'perf_hu55_feed_consolidated';
  const TARGETING = 'perf_hu55_feed_program_targeting';
  const POSTS = 'perf_hu55_forum_posts';

  const FACULTY_COUNT = 5;
  const PROGRAMS_PER_FACULTY = 4;
  const faculties = Array.from({ length: FACULTY_COUNT }, (_, i) => ({
    id: `F${i + 1}`,
    name: `Facultad ${i + 1}`,
    programIds: Array.from({ length: PROGRAMS_PER_FACULTY }, (_, j) => `F${i + 1}-P${j + 1}`)
  }));
  const programs = faculties.flatMap((f) => f.programIds.map((programId) => ({ id: programId, name: programId, facultyId: f.id })));
  const facultyResolver = new FacultyProgramResolver({ faculties, programs });

  // El programa y la facultad del estudiante cuyo feed se mide.
  const TARGET_PROGRAM = 'F1-P1';
  const TARGET_FACULTY = 'F1';

  const HOT_TOPIC = 'topic-hot';
  const HOT_TOPIC_POSTS = 8_000;

  beforeAll(async () => {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DATABASE);

    await MongoConvocatoriaRepository.ensureIndexes(db, CONSOLIDATED);
    await MongoProgramTargetingRepository.ensureIndexes(db, TARGETING);
    await MongoPostRepository.ensureIndexes(db, POSTS);

    const consolidated: unknown[] = [];
    const targeting: unknown[] = [];
    const now = Date.UTC(2026, 8, 25, 12, 0, 0);

    for (let i = 0; i < DOCS; i += 1) {
      const messageId = `hu55-m-${i}`;
      // Fecha: se reparte en los ultimos 180 dias, mas reciente para i mayor.
      const lastSentAt = new Date(now - (DOCS - i) * 60_000);
      const firstSentAt = lastSentAt;

      consolidated.push({
        _id: `hu55-c-${i}`,
        sender: `remitente-${i % 50}@upb.edu.co`,
        subject: `Convocatoria sintetica HU-55 ${i}`,
        body: `Cuerpo de la convocatoria sintetica numero ${i}.`,
        representativeMessageId: messageId,
        firstSentAt,
        lastSentAt,
        resendCount: 0,
        dueDate: { kind: 'sin-vencimiento' },
        applicationLink: null,
        withdrawnAt: null
      });

      // Programa/facultad: se reparte para que una fraccion apunte a todos
      // los estudiantes, otra a nivel de facultad y el resto a un programa
      // puntual — incluido el programa del estudiante cuyo feed se mide.
      if (i % 25 === 0) {
        targeting.push({ _id: messageId, messageId, kind: 'all-community', persistedAt: lastSentAt });
      } else if (i % 5 === 0) {
        const facultyId = faculties[i % FACULTY_COUNT]!.id;
        targeting.push({ _id: messageId, messageId, kind: 'faculty', facultyId, persistedAt: lastSentAt });
      } else {
        const programId = programs[i % programs.length]!.id;
        targeting.push({ _id: messageId, messageId, kind: 'programs', programIds: [programId], persistedAt: lastSentAt });
      }
    }

    // Un puñado de convocatorias del programa objetivo, para asegurar que el
    // feed medido no quede vacio por el reparto ciclico de arriba.
    for (let i = 0; i < 50; i += 1) {
      const messageId = `hu55-m-target-${i}`;
      const lastSentAt = new Date(now - i * 60_000);
      consolidated.push({
        _id: `hu55-c-target-${i}`,
        sender: 'coordinacion@upb.edu.co',
        subject: `Convocatoria del programa objetivo ${i}`,
        body: 'Cuerpo.',
        representativeMessageId: messageId,
        firstSentAt: lastSentAt,
        lastSentAt,
        resendCount: 0,
        dueDate: { kind: 'sin-vencimiento' },
        applicationLink: null,
        withdrawnAt: null
      });
      targeting.push({ _id: messageId, messageId, kind: 'programs', programIds: [TARGET_PROGRAM], persistedAt: lastSentAt });
    }

    const posts: unknown[] = [];
    for (let i = 0; i < DOCS; i += 1) {
      const inHotTopic = i < HOT_TOPIC_POSTS;
      posts.push({
        _id: `hu55-p-${i}`,
        topicId: inHotTopic ? HOT_TOPIC : `topic-${i % 40}`,
        author: { email: `estudiante${i % 200}@upb.edu.co`, name: `Estudiante ${i % 200}`, programName: 'Programa', programId: `F1-P${(i % 4) + 1}` },
        title: `Publicacion sintetica ${i}`,
        text: `Texto de la publicacion sintetica numero ${i}.`,
        publishedAt: new Date(now - (DOCS - i) * 1_000)
      });
    }

    await Promise.all([
      db.collection(CONSOLIDATED).insertMany(consolidated as never[], { ordered: false }),
      db.collection(TARGETING).insertMany(targeting as never[], { ordered: false }),
      db.collection(POSTS).insertMany(posts as never[], { ordered: false })
    ]);
  }, 120_000);

  afterAll(async () => {
    await Promise.all(
      [CONSOLIDATED, TARGETING, POSTS].map((name) => db.collection(name).drop().catch(() => undefined))
    );
    await client.close();
  });

  it(`GetSegmentedFeed.execute resuelve el feed de un estudiante contra ${DOCS + 50} convocatorias consolidadas en menos de ${BUDGET_MS}ms`, async () => {
    const feed = new GetSegmentedFeed({
      convocatoriaRepo: new MongoConvocatoriaRepository(db, CONSOLIDATED),
      programTargetingRepo: new MongoProgramTargetingRepository(db, TARGETING),
      facultyResolver
      // Sin classificationResultRepo/classificationRetryQueue: mismo alcance
      // que la prueba de rendimiento del criterio 3 (HU-55), que mide el
      // pipeline sin el paso de clasificacion.
    });

    const start = performance.now();
    const result = await feed.execute({ program: TARGET_PROGRAM, semester: 3 });
    const elapsedMs = performance.now() - start;

    // El programa objetivo recibe: sus 50 convocatorias directas + las
    // dirigidas a su facultad (F1) + las de "toda la comunidad". Con el
    // reparto de arriba esto es varios cientos de resultados, suficiente para
    // confirmar que el filtro realmente aplico (no listo la coleccion completa).
    expect(result.feed.length).toBeGreaterThan(50);
    expect(result.feed.length).toBeLessThan(DOCS);
    expect(elapsedMs).toBeLessThan(BUDGET_MS);
  }, 60_000);

  it('el feed de un estudiante nunca ve una convocatoria de un programa ajeno, incluso a esta escala', async () => {
    const feed = new GetSegmentedFeed({
      convocatoriaRepo: new MongoConvocatoriaRepository(db, CONSOLIDATED),
      programTargetingRepo: new MongoProgramTargetingRepository(db, TARGETING),
      facultyResolver
    });

    const result = await feed.execute({ program: TARGET_PROGRAM, semester: 3 });
    const otherProgramOnlyMessageIds = new Set(
      Array.from({ length: DOCS })
        .map((_, i) => i)
        .filter((i) => i % 5 !== 0 && i % 25 !== 0 && programs[i % programs.length]!.id !== TARGET_PROGRAM)
        .map((i) => `hu55-c-${i}`)
    );
    for (const entry of result.feed) {
      expect(otherProgramOnlyMessageIds.has(entry.id)).toBe(false);
    }
  }, 60_000);

  it(
    `MongoPostRepository.findByTopic recupera las publicaciones de un tema con ${HOT_TOPIC_POSTS} publicaciones (de ${DOCS} totales) en menos de ${BUDGET_MS}ms`,
    async () => {
      const posts = new MongoPostRepository(db, POSTS);

      const start = performance.now();
      const found = await posts.findByTopic(HOT_TOPIC);
      const elapsedMs = performance.now() - start;

      expect(found.length).toBe(HOT_TOPIC_POSTS);
      expect(elapsedMs).toBeLessThan(BUDGET_MS);
    },
    60_000
  );

  it(
    'evidencia del N+1 corregido: resolver targeting para 500 mensajes uno por uno es notablemente mas lento que resolverlos en un lote (findByMessageIds)',
    async () => {
      const repo = new MongoProgramTargetingRepository(db, TARGETING);
      const sampleIds = Array.from({ length: 500 }, (_, i) => `hu55-m-${i}`);

      const startSequential = performance.now();
      for (const id of sampleIds) {
        await repo.findByMessageId(id);
      }
      const sequentialMs = performance.now() - startSequential;

      const startBatched = performance.now();
      const batched = await repo.findByMessageIds(sampleIds);
      const batchedMs = performance.now() - startBatched;

      expect(batched.size).toBe(sampleIds.length);
      // Umbral generoso (no un multiplo estricto) para no volver la prueba
      // fragil ante variaciones de la maquina, pero suficiente para dejar
      // registrado que el patron anterior (una consulta por mensaje, el que
      // usaba `GetSegmentedFeed` antes de esta correccion) es sustancialmente
      // mas costoso que resolver el mismo lote en una sola consulta.
      expect(batchedMs).toBeLessThan(sequentialMs);
      // eslint-disable-next-line no-console
      console.log(
        `[HU-55 criterio 2] targeting de ${sampleIds.length} mensajes — secuencial (N+1, patron anterior): ${sequentialMs.toFixed(1)}ms; en lote (findByMessageIds, patron actual): ${batchedMs.toFixed(1)}ms`
      );
    },
    60_000
  );
});
