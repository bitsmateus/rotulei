/**
 * Cria as roles do Rotulei e aplica os privilegios de db/bootstrap.sql.
 *
 * Roda com um usuario ADMINISTRATIVO do Postgres (DATABASE_URL_ADMIN) — e o
 * unico script do projeto que precisa desse nivel de acesso.
 *
 *   npm run db:bootstrap
 */
import { Client } from 'pg';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { precisaDe } from './env.js';

const aqui = import.meta.dirname;

/** Escapa um literal de string SQL ('' para aspas simples). */
const literal = (v: string) => `'${v.replace(/'/g, "''")}'`;
/** Escapa um identificador SQL ("" para aspas duplas). */
const ident = (v: string) => `"${v.replace(/"/g, '""')}"`;

async function criarRole(cliente: Client, nome: string, senha: string) {
  const { rowCount } = await cliente.query('select 1 from pg_roles where rolname = $1', [nome]);
  const verbo = rowCount ? 'alter' : 'create';
  await cliente.query(`${verbo} role ${ident(nome)} login password ${literal(senha)}`);
  console.log(`  ${rowCount ? 'atualizada' : 'criada'}: ${nome}`);
}

async function main() {
  const urlAdmin = precisaDe('DATABASE_URL_ADMIN');
  const senhaOwner = precisaDe('ROTULEI_OWNER_PASSWORD');
  const senhaApp = precisaDe('ROTULEI_APP_PASSWORD');

  const cliente = new Client({ connectionString: urlAdmin });
  await cliente.connect();

  try {
    const { rows } = await cliente.query<{ db: string }>('select current_database() as db');
    const nomeDoBanco = rows[0].db;
    console.log(`bootstrap em "${nomeDoBanco}"`);

    console.log('roles:');
    await criarRole(cliente, 'rotulei_owner', senhaOwner);
    await criarRole(cliente, 'rotulei_app', senhaApp);

    const sql = await readFile(resolve(aqui, '../bootstrap.sql'), 'utf8');
    await cliente.query(sql.replaceAll(':"db_name"', ident(nomeDoBanco)));
    console.log('privilegios: aplicados');

    // Prova, contra o catalogo, que a role da API nao pode furar o RLS.
    const { rows: check } = await cliente.query<{
      rolsuper: boolean;
      rolbypassrls: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
    }>(
      `select rolsuper, rolbypassrls, rolcreatedb, rolcreaterole
         from pg_roles where rolname = 'rotulei_app'`,
    );
    const perigosos = Object.entries(check[0]).filter(([, v]) => v === true);
    if (perigosos.length > 0) {
      throw new Error(
        `rotulei_app ficou com privilegios que furam o RLS: ${perigosos.map(([k]) => k).join(', ')}`,
      );
    }
    console.log('verificado: rotulei_app sem superuser/bypassrls/createdb/createrole');
    console.log('\nbootstrap concluido.');
  } finally {
    await cliente.end();
  }
}

main().catch((erro) => {
  console.error('\nbootstrap falhou:', erro.message);
  process.exit(1);
});
