import { MongoClient } from 'mongodb';

/**
 * globalSetup de Vitest: verifica antes de correr cualquier prueba que existe
 * una instancia real de MongoDB alcanzable, en lugar de dejar que los tests de
 * infraestructura fallen uno por uno con timeouts confusos.
 *
 * Las pruebas de los adaptadores de MongoDB (tests/infrastructure/mongo/**)
 * corren contra esta instancia real y no contra un mock del driver, por
 * decisión explícita: un mock del cliente de MongoDB no verifica que el filtro,
 * el upsert o el índice declarado por el adaptador funcionen de verdad.
 */
const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';

export default async function ensureMongoAvailable(): Promise<void> {
  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 2000 });
  try {
    await client.connect();
    await client.db('admin').command({ ping: 1 });
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    throw new Error(
      `MongoDB no esta disponible en ${MONGODB_URI}.\n` +
        'Las pruebas de los adaptadores de MongoDB requieren una instancia real, no un mock.\n' +
        'Arrancala con: brew services start mongodb-community\n' +
        `Causa original: ${cause}`
    );
  } finally {
    await client.close();
  }
}
