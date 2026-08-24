import { defineConfig } from 'vitest/config';

export default defineConfig({
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
