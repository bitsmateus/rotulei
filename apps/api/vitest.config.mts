import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['db/tests/**/*.spec.ts', 'test/**/*.spec.ts', 'src/**/*.spec.ts'],
    // Testes de RLS e e2e batem no mesmo banco: paralelismo embaralha fixtures.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
    // Sobe a API compilada numa porta de teste antes da suite.
    globalSetup: ['./test/servidor.ts'],
  },
});
