/**
 * Roda as migrations como rotulei_owner (DATABASE_URL_MIGRATIONS).
 *
 * A role da API (rotulei_app) nao tem permissao de DDL — de proposito. Nenhum
 * caminho de codigo servido por HTTP consegue alterar o schema.
 *
 *   npm run db:migrate         # sobe tudo que falta
 *   npm run db:migrate:down    # desfaz a ultima
 */
import { resolve } from 'node:path';
import { precisaDe } from './env.js';
import * as npm from 'node-pg-migrate';

const runner: any = (npm as any).runner ?? (npm as any).default;

async function main() {
  const direcao = process.argv[2] === 'down' ? 'down' : 'up';

  const migracoes = await runner({
    databaseUrl: precisaDe('DATABASE_URL_MIGRATIONS'),
    dir: resolve(import.meta.dirname, '../migrations'),
    direction: direcao,
    count: direcao === 'down' ? 1 : Infinity,
    migrationsTable: 'pgmigrations',
    verbose: false,
  });

  console.log(
    migracoes.length
      ? `${migracoes.length} migration(s) aplicada(s) (${direcao}): ${migracoes.map((m: any) => m.name ?? m).join(', ')}`
      : 'Nada a fazer — banco ja esta atualizado.',
  );
}

main()
  .then(() => process.exit(0))
  .catch((erro) => {
    console.error('\nmigration falhou:', erro.message);
    process.exit(1);
  });
