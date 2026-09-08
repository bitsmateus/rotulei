import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const raiz = resolve(import.meta.dirname, '../..');
const porta = process.env.ROTULEI_TEST_PORT;
if (!porta) throw new Error('Use node apps/api/test/executar-isolado.mjs --browser');
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: '../../artifacts/playwright-report', open: 'never' }]],
  outputDir: '../../artifacts/playwright-results',
  use: { baseURL: 'http://localhost:5198', channel: 'msedge', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: [
    { command: 'node dist/main.js', cwd: resolve(raiz, 'apps/api'), url: `http://localhost:${porta}/api/saude`, env: { PORT: porta, NODE_ENV: 'test', DESABILITAR_LIMITES: 'false' }, reuseExistingServer: false },
    { command: `node "${resolve(raiz, 'node_modules/vite/bin/vite.js')}" --port 5198 --strictPort`, cwd: resolve(raiz, 'apps/web'), url: 'http://localhost:5198', reuseExistingServer: false },
  ],
});
