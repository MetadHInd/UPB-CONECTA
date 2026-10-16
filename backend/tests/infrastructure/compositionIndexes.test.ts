import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Los indices de MongoDB solo existen si alguien llama a `ensureIndexes` al
 * arrancar. Un repositorio que declara indices (unicos, TTL, de consulta) pero
 * que la raiz de composicion instancia sin crearlos deja la base en produccion
 * sin ellos y sin ningun error visible. Esta prueba lo vuelve un fallo de CI.
 */
const SRC = join(import.meta.dirname, '..', '..', 'src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : path.endsWith('.ts') ? [path] : [];
  });
}

const withIndexes = walk(SRC)
  .filter((file) => /static async ensureIndexes\(/.test(readFileSync(file, 'utf8')))
  .map((file) => /([A-Za-z]+)\.ts$/.exec(file)![1]!);

describe.each(['main.ts', 'http-server.ts'])('raiz de composicion %s', (entry) => {
  const source = readFileSync(join(SRC, entry), 'utf8');

  it('crea los indices de cada repositorio con indices que instancia', () => {
    const missing = withIndexes.filter(
      (repository) => source.includes(`new ${repository}(`) && !source.includes(`${repository}.ensureIndexes(`)
    );
    expect(missing).toEqual([]);
  });
});
