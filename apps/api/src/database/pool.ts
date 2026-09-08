import { Pool } from 'pg';
import { Kysely, PostgresDialect } from 'kysely';
import type { DB } from './tipos.js';

export function criarPool(urlDeConexao: string, maximo: number): Pool {
  return new Pool({
    connectionString: urlDeConexao,
    max: maximo,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    // Nome que aparece em pg_stat_activity — ajuda a achar conexao pendurada.
    application_name: 'rotulei-api',
  });
}

export function criarKysely(pool: Pool): Kysely<DB> {
  return new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
}

/**
 * Falha o boot se a API estiver conectada com uma role capaz de furar o RLS.
 *
 * E o unico erro de configuracao deste projeto que nao produz sintoma nenhum:
 * tudo continua funcionando, so que um tenant passa a enxergar dados de outro.
 * Melhor nao subir do que subir vazando.
 *
 * Sao QUATRO formas de furar, nao uma:
 *
 *  1. SUPERUSER          — ignora RLS por definicao.
 *  2. BYPASSRLS direto   — o atributo existe justamente para isso.
 *  3. BYPASSRLS herdado  — ser membro de uma role que o tenha vale o mesmo.
 *  4. Ser DONA da tabela — nao ignora o RLS enquanto FORCE estiver ligado, mas
 *     pode desliga-lo: `alter table cartazes no force row level security` e uma
 *     linha, e a partir dai a role enxerga todos os tenants. Uma injecao de SQL
 *     em qualquer endpoint viraria leitura completa do banco.
 *
 * O caso 4 e o unico que nao aparece em `pg_roles` e o mais facil de cometer:
 * basta apontar DATABASE_URL para a conexao que roda as migrations.
 */
export async function verificarRoleSegura(pool: Pool): Promise<string> {
  const { rows } = await pool.query<{
    usuario: string;
    rolsuper: boolean;
    rolbypassrls: boolean;
    rolcreaterole: boolean;
    herda_bypassrls: boolean;
    tabelas_que_possui: string;
  }>(
    `select
       current_user as usuario,
       r.rolsuper,
       r.rolbypassrls,
       r.rolcreaterole,
       exists (
         select 1 from pg_roles b
          where b.rolbypassrls and pg_has_role(current_user, b.oid, 'USAGE')
       ) as herda_bypassrls,
       (select count(*)
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and c.relkind = 'r'
           and pg_get_userbyid(c.relowner) = current_user) as tabelas_que_possui
     from pg_roles r
     where r.rolname = current_user`,
  );

  const info = rows[0];
  if (!info) throw new Error('Nao foi possivel identificar a role de conexao.');

  const problemas: string[] = [];
  if (info.rolsuper) problemas.push('e SUPERUSER');
  if (info.rolbypassrls) problemas.push('tem BYPASSRLS');
  if (info.herda_bypassrls) problemas.push('herda BYPASSRLS de outra role');
  if (info.rolcreaterole) problemas.push('tem CREATEROLE (pode se dar mais poder)');
  if (Number(info.tabelas_que_possui) > 0) {
    problemas.push(
      `e dona de ${info.tabelas_que_possui} tabela(s) — dono pode desligar o ` +
        'FORCE ROW LEVEL SECURITY e passar a enxergar todos os tenants',
    );
  }

  if (problemas.length > 0) {
    throw new Error(
      `A API esta conectada como "${info.usuario}", que pode furar o Row-Level ` +
        `Security: ${problemas.join('; ')}. O isolamento entre tenants estaria ` +
        `comprometido. Aponte DATABASE_URL para rotulei_app (a role sem DDL) e ` +
        `deixe rotulei_owner apenas em DATABASE_URL_MIGRATIONS.`,
    );
  }

  return info.usuario;
}
