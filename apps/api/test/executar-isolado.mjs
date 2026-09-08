import { config } from 'dotenv';
import { Client } from 'pg';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

const raiz = resolve(import.meta.dirname, '../../..');
config({ path: resolve(raiz, '.env'), quiet: true });
const nome = `rotulei_test_${randomBytes(8).toString('hex')}`;
const adminUrl = new URL(process.env.DATABASE_URL_ADMIN);
if (!['localhost', '127.0.0.1', '[::1]'].includes(adminUrl.hostname)) {
  throw new Error('Testes isolados exigem Postgres local.');
}
const ambiente = { ...process.env, NODE_ENV: 'test' };
for (const chave of ['DATABASE_URL', 'DATABASE_URL_ADMIN', 'DATABASE_URL_MIGRATIONS']) {
  const url = new URL(process.env[chave]);
  url.pathname = `/${nome}`;
  ambiente[chave] = url.toString();
}
const reserva = createServer();
await new Promise((ok, falha) => { reserva.once('error', falha); reserva.listen(0, '127.0.0.1', ok); });
ambiente.ROTULEI_TEST_PORT = String(reserva.address().port);
await new Promise(ok => reserva.close(ok));

async function executar(argumentos) {
  await new Promise((ok, falha) => {
    const filho = spawn(process.execPath, argumentos, { cwd: resolve(raiz, 'apps/api'), env: ambiente, stdio: 'inherit' });
    filho.once('error', falha);
    filho.once('exit', codigo => codigo === 0 ? ok() : falha(new Error(`Etapa de teste terminou com codigo ${codigo}`)));
  });
}

const admin = new Client({ connectionString: adminUrl.toString() });
await admin.connect();
let criado = false;
try {
  await admin.query(`create database "${nome}"`);
  criado = true;
  const banco = new Client({ connectionString: ambiente.DATABASE_URL_ADMIN });
  await banco.connect();
  try {
    // Apenas privilegios do banco novo; nao altera roles compartilhadas.
    const bootstrap = (await readFile(resolve(raiz, 'apps/api/db/bootstrap.sql'), 'utf8'))
      .replace(/^alter role rotulei_app .*;$/m, '')
      .replaceAll(':"db_name"', `"${nome}"`);
    await banco.query(bootstrap);
  } finally { await banco.end(); }
  await executar(['--import', 'tsx', 'db/scripts/migrate.ts', 'up']);
  await executar(['--import', 'tsx', 'db/scripts/seed.ts']);
  if (process.argv.includes('--browser')) {
    await executar([resolve(raiz, 'node_modules/playwright/cli.js'), 'test', '--config', resolve(raiz, 'apps/web/playwright.config.ts')]);
  } else {
    await executar([resolve(raiz, 'node_modules/vitest/vitest.mjs'), 'run']);
  }
} catch (erro) {
  console.error(erro.message);
  process.exitCode = 1;
} finally {
  // O nome e gerado nesta execucao e so removido apos CREATE bem-sucedido.
  if (criado) await admin.query(`drop database "${nome}" with (force)`);
  await admin.end();
}
