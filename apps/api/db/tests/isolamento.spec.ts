/**
 * A prova da Fase 0.
 *
 * O criterio do escopo e literal: "toda leitura/escrita passa por
 * WHERE tenant_id = :atual, garantido via politica de RLS — nao por logica
 * espalhada na aplicacao".
 *
 * Por isso quase todo teste aqui usa consulta SEM filtro de tenant, de
 * proposito. Se o isolamento dependesse de a aplicacao lembrar do WHERE, estes
 * testes falhariam.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { sql } from 'kysely';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { criarKysely, criarPool, verificarRoleSegura } from '../../src/database/pool.js';
import { ContextoDbService } from '../../src/database/contexto-db.service.js';
import type { ContextoSessao } from '../../src/database/contexto.js';

config({ path: resolve(process.cwd(), '../../.env'), quiet: true });

let pool: Pool;
let db: ContextoDbService;

const marca = `t${Date.now().toString(36)}`;

const fixtures = {
  planoId: '',
  tenantA: '',
  lojaA: '',
  adminA: '',
  operadorA: '',
  tenantB: '',
  lojaB: '',
  superadminId: '',
};

const ctx = (
  papel: ContextoSessao['papel'],
  tenantId: string | null,
  usuarioId: string | null = null,
): ContextoSessao => ({ papel, tenantId, usuarioId });

const comoAdminA = () => ctx('admin', fixtures.tenantA, fixtures.adminA);
const comoOperadorA = () => ctx('operador', fixtures.tenantA, fixtures.operadorA);
const comoAdminB = () => ctx('admin', fixtures.tenantB);
const comoSuperadmin = () => ctx('superadmin', null, fixtures.superadminId);
const semContexto = () => ctx(null, null);

/** CNPJ sintetico de 14 digitos, unico por execucao. */
const cnpjFake = (sufixo: number) =>
  (Date.now().toString() + String(sufixo)).slice(-14).padStart(14, '9');

beforeAll(async () => {
  pool = criarPool(process.env.DATABASE_URL!, 5);
  await verificarRoleSegura(pool);
  db = new ContextoDbService(criarKysely(pool));

  await db.comoSistema('fixtures de teste', async (trx) => {
    const plano = await trx
      .selectFrom('planos')
      .select('id')
      .where('codigo', '=', 'rede')
      .executeTakeFirstOrThrow();
    fixtures.planoId = plano.id;

    const tA = await trx
      .insertInto('tenants')
      .values({
        nome: `Teste A ${marca}`,
        cnpj: cnpjFake(1),
        slug: `teste-a-${marca}`,
        status: 'ativo',
        plano_id: fixtures.planoId,
        trial_termina_em: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    fixtures.tenantA = tA.id;

    const tB = await trx
      .insertInto('tenants')
      .values({
        nome: `Teste B ${marca}`,
        cnpj: cnpjFake(2),
        slug: `teste-b-${marca}`,
        status: 'ativo',
        plano_id: fixtures.planoId,
        trial_termina_em: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    fixtures.tenantB = tB.id;

    const lA = await trx
      .insertInto('lojas')
      .values({ tenant_id: fixtures.tenantA, nome: 'Loja A', endereco: null })
      .returning('id')
      .executeTakeFirstOrThrow();
    fixtures.lojaA = lA.id;

    const lB = await trx
      .insertInto('lojas')
      .values({ tenant_id: fixtures.tenantB, nome: 'Loja B', endereco: null })
      .returning('id')
      .executeTakeFirstOrThrow();
    fixtures.lojaB = lB.id;

    const uA = await trx
      .insertInto('usuarios')
      .values({
        tenant_id: fixtures.tenantA,
        loja_id: null,
        nome: 'Admin A',
        email: `admin.a.${marca}@teste.com`,
        papel: 'admin',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    fixtures.adminA = uA.id;

    const oA = await trx
      .insertInto('usuarios')
      .values({
        tenant_id: fixtures.tenantA,
        loja_id: fixtures.lojaA,
        nome: 'Operador A',
        email: `op.a.${marca}@teste.com`,
        papel: 'operador',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    fixtures.operadorA = oA.id;

    await trx
      .insertInto('usuarios')
      .values({
        tenant_id: fixtures.tenantB,
        loja_id: null,
        nome: 'Admin B',
        email: `admin.b.${marca}@teste.com`,
        papel: 'admin',
      })
      .execute();

    const sa = await trx
      .selectFrom('usuarios')
      .select('id')
      .where('papel', '=', 'superadmin')
      .executeTakeFirstOrThrow();
    fixtures.superadminId = sa.id;
  });
});

afterAll(async () => {
  if (db) {
    await db.comoSistema('limpeza dos fixtures', (trx) =>
      trx
        .deleteFrom('tenants')
        .where('id', 'in', [fixtures.tenantA, fixtures.tenantB])
        .execute(),
    );
  }
  await pool?.end();
});

describe('a role da API nao consegue furar o RLS', () => {
  it('nao e superuser e nao tem BYPASSRLS', async () => {
    const { rows } = await pool.query(
      `select current_user as u, rolsuper, rolbypassrls
         from pg_roles where rolname = current_user`,
    );
    expect(rows[0].u).toBe('rotulei_app');
    expect(rows[0].rolsuper).toBe(false);
    expect(rows[0].rolbypassrls).toBe(false);
  });

  it('nao consegue desligar o RLS de uma tabela', async () => {
    await expect(
      pool.query('alter table lojas disable row level security'),
    ).rejects.toThrow();
  });

  it('nao consegue ler a tabela de controle de migrations', async () => {
    await expect(pool.query('select * from pgmigrations')).rejects.toThrow();
  });
});

describe('leitura isolada por tenant (queries SEM filtro)', () => {
  it('tenant A so enxerga as proprias lojas', async () => {
    const lojas = await db.comContexto(comoAdminA(), (trx) =>
      trx.selectFrom('lojas').selectAll().execute(),
    );
    expect(lojas.length).toBeGreaterThan(0);
    expect(lojas.every((l) => l.tenant_id === fixtures.tenantA)).toBe(true);
    expect(lojas.map((l) => l.id)).not.toContain(fixtures.lojaB);
  });

  it('tenant A so enxerga os proprios usuarios', async () => {
    const usuarios = await db.comContexto(comoAdminA(), (trx) =>
      trx.selectFrom('usuarios').selectAll().execute(),
    );
    expect(usuarios.length).toBeGreaterThan(0);
    expect(usuarios.every((u) => u.tenant_id === fixtures.tenantA)).toBe(true);
  });

  it('superadmin (tenant_id null) fica invisivel para o tenant', async () => {
    const usuarios = await db.comContexto(comoAdminA(), (trx) =>
      trx.selectFrom('usuarios').selectAll().where('papel', '=', 'superadmin').execute(),
    );
    expect(usuarios).toHaveLength(0);
  });

  it('busca direta pelo id de outro tenant devolve vazio', async () => {
    const loja = await db.comContexto(comoAdminA(), (trx) =>
      trx.selectFrom('lojas').selectAll().where('id', '=', fixtures.lojaB).executeTakeFirst(),
    );
    expect(loja).toBeUndefined();
  });

  it('tenant A nao enxerga o registro do tenant B', async () => {
    const tenants = await db.comContexto(comoAdminA(), (trx) =>
      trx.selectFrom('tenants').selectAll().execute(),
    );
    expect(tenants.map((t) => t.id)).toEqual([fixtures.tenantA]);
  });

  it('sem contexto nao ve linha nenhuma — o modo de falha e negar', async () => {
    const resultado = await db.comContexto(semContexto(), async (trx) => ({
      lojas: await trx.selectFrom('lojas').selectAll().execute(),
      usuarios: await trx.selectFrom('usuarios').selectAll().execute(),
      tenants: await trx.selectFrom('tenants').selectAll().execute(),
    }));
    expect(resultado.lojas).toHaveLength(0);
    expect(resultado.usuarios).toHaveLength(0);
    expect(resultado.tenants).toHaveLength(0);
  });

  it('superadmin enxerga os dois tenants', async () => {
    const tenants = await db.comContexto(comoSuperadmin(), (trx) =>
      trx.selectFrom('tenants').selectAll().execute(),
    );
    const ids = tenants.map((t) => t.id);
    expect(ids).toContain(fixtures.tenantA);
    expect(ids).toContain(fixtures.tenantB);
  });
});

describe('escrita isolada por tenant', () => {
  it('tenant A nao cria loja carimbada com o tenant_id de B', async () => {
    await expect(
      db.comContexto(comoAdminA(), (trx) =>
        trx
          .insertInto('lojas')
          .values({ tenant_id: fixtures.tenantB, nome: 'Invasora', endereco: null })
          .execute(),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('UPDATE sem WHERE do tenant A nao toca em linha de B', async () => {
    await db.comContexto(comoAdminA(), (trx) =>
      trx.updateTable('lojas').set({ endereco: 'alterado por A' }).execute(),
    );

    const lojaB = await db.comContexto(comoAdminB(), (trx) =>
      trx.selectFrom('lojas').selectAll().where('id', '=', fixtures.lojaB).executeTakeFirstOrThrow(),
    );
    expect(lojaB.endereco).toBeNull();
  });

  it('DELETE sem WHERE do tenant A nao apaga linha de B', async () => {
    await db.comContexto(comoAdminA(), (trx) => trx.deleteFrom('lojas').execute());

    const lojasB = await db.comContexto(comoAdminB(), (trx) =>
      trx.selectFrom('lojas').selectAll().execute(),
    );
    expect(lojasB.map((l) => l.id)).toContain(fixtures.lojaB);

    // devolve a loja de A para os testes seguintes
    await db.comoSistema('restaurar fixture', (trx) =>
      trx
        .insertInto('lojas')
        .values({ tenant_id: fixtures.tenantA, nome: 'Loja A', endereco: null })
        .execute(),
    );
  });
});

describe('papeis', () => {
  it('operador nao cria usuario', async () => {
    await expect(
      db.comContexto(comoOperadorA(), (trx) =>
        trx
          .insertInto('usuarios')
          .values({
            tenant_id: fixtures.tenantA,
            loja_id: null,
            nome: 'X',
            email: `x.${marca}@teste.com`,
            papel: 'operador',
          })
          .execute(),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('operador nao cria loja', async () => {
    await expect(
      db.comContexto(comoOperadorA(), (trx) =>
        trx
          .insertInto('lojas')
          .values({ tenant_id: fixtures.tenantA, nome: 'Nova', endereco: null })
          .execute(),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('admin do tenant nao consegue fabricar um superadmin', async () => {
    await expect(
      db.comContexto(comoAdminA(), (trx) =>
        trx
          .insertInto('usuarios')
          .values({
            tenant_id: null,
            loja_id: null,
            nome: 'Falso',
            email: `falso.${marca}@teste.com`,
            papel: 'superadmin',
          })
          .execute(),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('admin do tenant nao cria tenant novo', async () => {
    await expect(
      db.comContexto(comoAdminA(), (trx) =>
        trx
          .insertInto('tenants')
          .values({
            nome: 'Pirata',
            cnpj: cnpjFake(7),
            slug: `pirata-${marca}`,
            status: 'ativo',
            plano_id: fixtures.planoId,
            trial_termina_em: null,
          })
          .execute(),
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('status do tenant so muda pelo sistema', () => {
  it('admin edita o nome do proprio tenant', async () => {
    await db.comContexto(comoAdminA(), (trx) =>
      trx
        .updateTable('tenants')
        .set({ nome: 'Renomeado por A' })
        .where('id', '=', fixtures.tenantA)
        .execute(),
    );

    const t = await db.comContexto(comoAdminA(), (trx) =>
      trx.selectFrom('tenants').selectAll().executeTakeFirstOrThrow(),
    );
    expect(t.nome).toBe('Renomeado por A');
  });

  it('admin NAO reativa o proprio tenant depois de suspenso', async () => {
    await db.comoSistema('suspender para o teste', (trx) =>
      trx
        .updateTable('tenants')
        .set({ status: 'suspenso' })
        .where('id', '=', fixtures.tenantA)
        .execute(),
    );

    await expect(
      db.comContexto(comoAdminA(), (trx) =>
        trx
          .updateTable('tenants')
          .set({ status: 'ativo' })
          .where('id', '=', fixtures.tenantA)
          .execute(),
      ),
    ).rejects.toThrow(/status do tenant/i);
  });

  it('o webhook (contexto sistema) muda o status', async () => {
    await db.comoSistema('webhook: pagamento aprovado', (trx) =>
      trx
        .updateTable('tenants')
        .set({ status: 'ativo' })
        .where('id', '=', fixtures.tenantA)
        .execute(),
    );

    const t = await db.comContexto(comoAdminA(), (trx) =>
      trx.selectFrom('tenants').selectAll().executeTakeFirstOrThrow(),
    );
    expect(t.status).toBe('ativo');
  });
});

describe('catalogo de planos', () => {
  it('e legivel sem login — a pagina publica de cadastro depende disso', async () => {
    const planos = await db.comoAnonimo((trx) =>
      trx.selectFrom('planos').selectAll().execute(),
    );
    expect(planos.map((p) => p.codigo)).toEqual(
      expect.arrayContaining(['inicio', 'rede', 'enterprise']),
    );
  });

  it('admin de tenant nao muda preco de plano', async () => {
    const antes = await db.comoAnonimo((trx) =>
      trx.selectFrom('planos').select(['id', 'preco_mensal_centavos']).orderBy('codigo').execute(),
    );

    // Duas semanticas diferentes de RLS, e vale saber a diferenca:
    //   WITH CHECK falhando  -> ERRO (a linha resultante seria invalida)
    //   USING nao batendo    -> 0 linhas, SEM erro (a linha nem fica visivel)
    // Como o admin nao enxerga planos para escrita, o UPDATE e um no-op
    // silencioso. Nao ha erro para asseverar — o que importa e que nada mudou.
    const resultado = await db.comContexto(comoAdminA(), (trx) =>
      trx.updateTable('planos').set({ preco_mensal_centavos: 1 }).execute(),
    );
    expect(resultado[0].numUpdatedRows).toBe(0n);

    const depois = await db.comoAnonimo((trx) =>
      trx.selectFrom('planos').select(['id', 'preco_mensal_centavos']).orderBy('codigo').execute(),
    );
    expect(depois).toEqual(antes);
  });
});

describe('o contexto nao vaza entre transacoes', () => {
  it('reusando a mesma conexao do pool, o tenant anterior nao persiste', async () => {
    // pool de UMA conexao: garante que a segunda transacao pega exatamente a
    // mesma conexao fisica que a primeira usou.
    const poolDeUm = criarPool(process.env.DATABASE_URL!, 1);
    const kysely = criarKysely(poolDeUm);
    const dbUm = new ContextoDbService(kysely);

    try {
      const comoA = await dbUm.comContexto(comoAdminA(), (trx) =>
        trx.selectFrom('lojas').selectAll().execute(),
      );
      expect(comoA.every((l) => l.tenant_id === fixtures.tenantA)).toBe(true);

      const depois = await dbUm.comContexto(semContexto(), async (trx) => {
        const { rows } = await sql<{
          t: string | null;
        }>`select current_setting('app.tenant_id', true) as t`.execute(trx);
        return { guc: rows[0].t, lojas: await trx.selectFrom('lojas').selectAll().execute() };
      });

      expect(depois.guc === null || depois.guc === '').toBe(true);
      expect(depois.lojas).toHaveLength(0);
    } finally {
      await kysely.destroy();
    }
  });
});
