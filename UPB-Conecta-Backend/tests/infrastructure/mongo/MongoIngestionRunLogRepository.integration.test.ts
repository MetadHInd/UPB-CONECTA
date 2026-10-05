import { MongoClient, type Db } from 'mongodb';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { MongoIngestionRunLogRepository } from '../../../src/contexts/ingestion/infrastructure/adapters/out/mongo/MongoIngestionRunLogRepository.js';
import { IngestionRunLog } from '../../../src/contexts/ingestion/domain/entities/IngestionRunLog.js';

const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
const DATABASE = process.env['MONGODB_TEST_DATABASE'] ?? 'upb_conecta_test';
const COLLECTION = 'ingestion_run_logs';

interface RunLogDocument {
  startedAt: Date;
  finishedAt: Date | null;
  read: number;
  processed: number;
  duplicated: number;
  quarantined: number;
  incidents: { messageId: string | null; cause: string; occurredAt: Date }[];
}

/** RF-07: la bitacora consultable por el administrador tiene que sobrevivir a un motor real. */
describe('MongoIngestionRunLogRepository (integración contra MongoDB real)', () => {
  let client: MongoClient;
  let db: Db;
  let repository: MongoIngestionRunLogRepository;

  beforeAll(async () => {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DATABASE);
    await MongoIngestionRunLogRepository.ensureIndexes(db);
  });

  beforeEach(async () => {
    await db.collection(COLLECTION).deleteMany({});
    repository = new MongoIngestionRunLogRepository(db);
  });

  afterAll(async () => {
    // Solo se limpia la propia coleccion: los tres archivos de integración
    // comparten la base "upb_conecta_test" y Vitest los corre en paralelo, de
    // modo que un dropDatabase() aqui podria borrar las colecciones de los
    // otros archivos mientras sus pruebas todavia estan corriendo.
    await db.collection(COLLECTION).drop().catch(() => undefined);
    await client.close();
  });

  it('persiste una bitacora completa con sus contadores', async () => {
    const startedAt = new Date('2026-08-24T10:00:00Z');
    const finishedAt = new Date('2026-08-24T10:00:05Z');
    const log = new IngestionRunLog(startedAt);
    log.recordRead();
    log.recordProcessed();
    log.recordRead();
    log.recordDuplicate();
    log.finish(finishedAt);

    await repository.save(log);

    const stored = await db.collection<RunLogDocument>(COLLECTION).findOne({});
    expect(stored?.read).toBe(2);
    expect(stored?.processed).toBe(1);
    expect(stored?.duplicated).toBe(1);
    expect(stored?.quarantined).toBe(0);
    expect(stored?.finishedAt).toEqual(finishedAt);
  });

  it('persiste los incidentes registrados durante la ejecucion', async () => {
    const log = new IngestionRunLog(new Date('2026-08-24T10:00:00Z'));
    log.recordIncident('a@upb.edu.co', 'fallo simulado en el uid 103', new Date('2026-08-24T10:00:01Z'));

    await repository.save(log);

    const stored = await db.collection<RunLogDocument>(COLLECTION).findOne({});
    expect(stored?.incidents).toHaveLength(1);
    expect(stored?.incidents[0]?.cause).toContain('uid 103');
    expect(stored?.incidents[0]?.messageId).toBe('a@upb.edu.co');
  });

  it('cada ejecucion se guarda como un documento independiente', async () => {
    await repository.save(new IngestionRunLog(new Date('2026-08-24T10:00:00Z')));
    await repository.save(new IngestionRunLog(new Date('2026-08-24T11:00:00Z')));

    const count = await db.collection(COLLECTION).countDocuments({});
    expect(count).toBe(2);
  });

  it('crea el indice descendente sobre startedAt declarado por el adaptador', async () => {
    const indexes = await db.collection(COLLECTION).indexes();
    expect(indexes.some((index) => index.name === 'idx_started_at_desc')).toBe(true);
  });
});
