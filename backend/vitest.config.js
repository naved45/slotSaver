import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/tests/**/*.test.js'],
    environment: 'node',
    // Database tests share one test database, so files run one at a time.
    fileParallelism: false,
    testTimeout: 30000,
    env: {
      // FerretDB (used locally for tests) does not implement TTL indexes.
      MONGO_TTL_INDEXES: 'off',
    },
  },
});
