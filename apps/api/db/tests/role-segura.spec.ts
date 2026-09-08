/**
 * A verificacao de boot que impede o pior erro de configuracao do projeto.
 *
 * Apontar DATABASE_URL para a conexao errada nao gera erro nenhum: a API sobe,
 * responde tudo e simplesmente para de isolar os tenants. Por isso a checagem
 * existe, e por isso ela precisa de teste proprio.
 *
 * O caso interessante e o `rotulei_owner`: ele NAO e superuser e NAO tem
 * BYPASSRLS, entao uma checagem ingenua (so `pg_roles`) o aprova. Mas ele e
 * dono das tabelas, e dono desliga o FORCE ROW LEVEL SECURITY com uma linha.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { criarPool, verificarRoleSegura } from '../../src/database/pool';
import type { Pool } from 'pg';

config({ path: resolve(process.cwd(), '../../.env'), quiet: true });

const pools: Pool[] = [];
const abrir = (url: string) => {
  const p = criarPool(url, 2);
  pools.push(p);
  return p;
};

afterAll(async () => {
  await Promise.all(pools.map((p) => p.end().catch(() => {})));
});

describe('verificarRoleSegura', () => {
  it('aprova a role da API', async () => {
    const role = await verificarRoleSegura(abrir(process.env.DATABASE_URL!));
    expect(role).toBe('rotulei_app');
  });

  it('RECUSA a role dona das tabelas, mesmo sem superuser nem BYPASSRLS', async () => {
    const pool = abrir(process.env.DATABASE_URL_MIGRATIONS!);

    await expect(verificarRoleSegura(pool)).rejects.toThrow(/dona de \d+ tabela/i);
    await expect(verificarRoleSegura(pool)).rejects.toThrow(
      /FORCE ROW LEVEL SECURITY/i,
    );
  });

  it('RECUSA o usuario administrativo do Postgres', async () => {
    await expect(
      verificarRoleSegura(abrir(process.env.DATABASE_URL_ADMIN!)),
    ).rejects.toThrow(/SUPERUSER/i);
  });

  it('a mensagem diz o que fazer, nao so o que esta errado', async () => {
    await expect(
      verificarRoleSegura(abrir(process.env.DATABASE_URL_MIGRATIONS!)),
    ).rejects.toThrow(/Aponte DATABASE_URL para rotulei_app/i);
  });
});

describe('a role da API nao tem como desligar a protecao', () => {
  it('nao e dona de tabela nenhuma', async () => {
    const pool = abrir(process.env.DATABASE_URL!);
    const { rows } = await pool.query<{ n: string }>(
      `select count(*) as n
         from pg_class c
         join pg_namespace ns on ns.oid = c.relnamespace
        where ns.nspname = 'public'
          and c.relkind = 'r'
          and pg_get_userbyid(c.relowner) = current_user`,
    );
    expect(Number(rows[0].n)).toBe(0);
  });

  it('nao consegue desligar o FORCE de uma tabela', async () => {
    const pool = abrir(process.env.DATABASE_URL!);
    await expect(
      pool.query('alter table cartazes no force row level security'),
    ).rejects.toThrow();
  });

  it('nao consegue apagar uma politica', async () => {
    const pool = abrir(process.env.DATABASE_URL!);
    await expect(pool.query('drop policy cartazes_leitura on cartazes')).rejects.toThrow();
  });

  it('nao consegue criar tabela (e virar dona dela)', async () => {
    const pool = abrir(process.env.DATABASE_URL!);
    await expect(pool.query('create table teste_invasao (id int)')).rejects.toThrow();
  });
});

describe('toda tabela de negocio tem RLS ligado E forcado', () => {
  it('nenhuma ficou de fora', async () => {
    const pool = abrir(process.env.DATABASE_URL_MIGRATIONS!);
    const { rows } = await pool.query<{
      tabela: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `select c.relname as tabela, c.relrowsecurity, c.relforcerowsecurity
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind = 'r'
          and c.relname <> 'pgmigrations'
        order by c.relname`,
    );

    expect(rows.length).toBeGreaterThan(0);

    for (const t of rows) {
      // `enable` sem `force` deixa a dona das tabelas passar por cima —
      // e as migrations rodam justamente como a dona.
      expect(t.relrowsecurity, `${t.tabela} sem RLS habilitado`).toBe(true);
      expect(t.relforcerowsecurity, `${t.tabela} sem FORCE`).toBe(true);
    }
  });

  it('nenhuma tabela com RLS ficou sem politica (o que negaria tudo em silencio)', async () => {
    const pool = abrir(process.env.DATABASE_URL_MIGRATIONS!);
    const { rows } = await pool.query<{ tabela: string }>(
      `select c.relname as tabela
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind = 'r'
          and c.relrowsecurity
          and not exists (select 1 from pg_policy p where p.polrelid = c.oid)`,
    );
    expect(rows.map((r) => r.tabela)).toEqual([]);
  });
});
