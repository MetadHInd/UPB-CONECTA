import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// El config vive en config/, pero include/globalSetup/coverage siguen
// escritos en relacion a la raiz del proyecto para no reescribir cada ruta.
const projectRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  root: projectRoot,
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/setup/ensureMongoAvailable.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/contexts/**/domain/**',
        'src/contexts/**/application/**'
      ],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 }
    }
  }
});
