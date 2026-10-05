import { MongoClient, type Db } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoAccountRoleRepository } from '../../../src/contexts/identity/infrastructure/adapters/out/mongo/MongoAccountRoleRepository.js';
import { Role } from '../../../src/contexts/identity/domain/value-objects/Role.js';

const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
const DATABASE = process.env['MONGODB_TEST_DATABASE'] ?? 'upb_conecta_test';
const COLLECTION = 'nosql_injection_safety_test';

/**
 * HU-47, criterio 7 (inyeccion en consultas). No hay nada que "arreglar" en
 * el codigo de este repositorio: ningun adaptador construye un filtro de
 * Mongo a partir de JSON sin tipar que llegue del cliente — todos reciben
 * parametros tipados (`string`, en este caso) que el driver serializa
 * siempre como un valor literal, nunca como un operador. Esta prueba
 * documenta y verifica esa garantia contra una base real, en vez de
 * asumirla: si algun cambio futuro empezara a construir filtros desde datos
 * externos sin tipar, esta prueba seria la primera en romperse.
 */
describe('Seguridad ante inyeccion NoSQL (HU-47, criterio 7) — verificado contra MongoDB real', () => {
  let client: MongoClient;
  let db: Db;

  beforeAll(async () => {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DATABASE);
  });

  beforeEach(async () => {
    await db.collection(COLLECTION).deleteMany({});
  });

  afterAll(async () => {
    await db.collection(COLLECTION).drop().catch(() => undefined);
    await client.close();
  });

  it('un valor que parece un operador de Mongo se trata como texto literal, no como consulta', async () => {
    const repository = new MongoAccountRoleRepository(db, COLLECTION);
    await repository.save({ subject: 'victima@upb.edu.co', role: Role.CONTENT_ADMIN, assignedAt: new Date(), assignedBy: 'seed' });

    const injectionAttempt = '{"$ne": null}';
    const found = await repository.findBySubject(injectionAttempt);

    expect(found).toBeNull(); // no matchea de forma inesperada al registro real
    expect(await repository.findBySubject('victima@upb.edu.co')).not.toBeNull(); // el registro real sigue intacto y accesible
  });

  it('un intento de operador $where como texto no altera ni expone otros documentos', async () => {
    const repository = new MongoAccountRoleRepository(db, COLLECTION);
    await repository.save({ subject: 's1', role: Role.STUDENT, assignedAt: new Date(), assignedBy: 'seed' });
    await repository.save({ subject: 's2', role: Role.CONTENT_ADMIN, assignedAt: new Date(), assignedBy: 'seed' });

    const found = await repository.findBySubject("'; return true; var x='");

    expect(found).toBeNull();
    expect(await db.collection(COLLECTION).countDocuments()).toBe(2);
  });
});
