/**
 * RLS das tabelas novas do fluxo de cobranca: config_plataforma, assinaturas,
 * pagamentos. Mesmo criterio do resto do projeto — testes SEM filtro de
 * tenant, provando que o isolamento vem da politica, nao da aplicacao.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { criarKysely, criarPool, verificarRoleSegura } from '../../src/database/pool';
import { ContextoDbService } from '../../src/database/contexto-db.service';
import type { ContextoSessao } from '../../src/database/contexto';

config({ path: resolve(process.cwd(), '../../.env'), quiet: true });

let pool: Pool;
let db: ContextoDbService;

const marca = `pf${Date.now().toString(36)}`;

const fixtures = {
  planoId: '',
  tenantA: '',
  tenantB: '',
  adminA: '',
  assinaturaA: '',
};

const ctx = (papel: ContextoSessao['papel'], tenantId: string | null): ContextoSessao => ({
  papel,
  tenantId,
  usuarioId: null,
});

const comoAdminA = () => ctx('admin', fixtures.tenantA);
const comoAdminB = () => ctx('admin', fixtures.tenantB);
const comoSuperadmin = () => ctx('superadmin', null);

const cnpjFake = (sufixo: number) =>
  (Date.now().toString() + String(sufixo)).slice(-14).padStart(14, '8');

beforeAll(async () => {
  pool = criarPool(process.env.DATABASE_URL!, 5);
  await verificarRoleSegura(pool);
  db = new ContextoDbService(criarKysely(pool));

  await db.comoSistema('fixtures plataforma-rls', async (trx) => {
    const plano = await trx
      .selectFrom('planos')
      .select('id')
      .where('codigo', '=', 'inicio')
      .executeTakeFirstOrThrow();
    fixtures.planoId = plano.id;

    const tA = await trx
      .insertInto('tenants')
      .values({
        nome: `PF Tenant A ${marca}`,
        cnpj: cnpjFake(1),
        slug: `pf-a-${marca}`,
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
        nome: `PF Tenant B ${marca}`,
        cnpj: cnpjFake(2),
        slug: `pf-b-${marca}`,
        status: 'ativo',
        plano_id: fixtures.planoId,
        trial_termina_em: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    fixtures.tenantB = tB.id;

    const uA = await trx
      .insertInto('usuarios')
      .values({
        tenant_id: fixtures.tenantA,
        loja_id: null,
        nome: 'Admin PF A',
        email: `admin.pf.a.${marca}@teste.com`,
        papel: 'admin',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    fixtures.adminA = uA.id;

    const assinatura = await trx
      .insertInto('assinaturas')
      .values({
        tenant_id: fixtures.tenantA,
        plano_id: fixtures.planoId,
        gateway_subscription_id: `sub_${marca}`,
        status: 'ativa',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    fixtures.assinaturaA = assinatura.id;

    await trx
      .insertInto('pagamentos')
      .values({
        tenant_id: fixtures.tenantA,
        assinatura_id: fixtures.assinaturaA,
        valor_centavos: 8900,
        metodo: 'pix',
        status: 'confirmado',
        gateway_payment_id: `pay_${marca}`,
        pago_em: new Date(),
      })
      .execute();

    await trx
      .insertInto('config_plataforma')
      .values({
        chave: `teste_${marca}`,
        ambiente: 'sandbox',
        credenciais_cifradas: 'nao-usado-neste-teste',
      })
      .execute();
  });
});

afterAll(async () => {
  if (db) {
    await db.comoSistema('limpeza plataforma-rls', async (trx) => {
      await trx.deleteFrom('config_plataforma').where('chave', '=', `teste_${marca}`).execute();
      await trx.deleteFrom('tenants').where('id', 'in', [fixtures.tenantA, fixtures.tenantB]).execute();
    });
  }
  await pool?.end();
});

describe('assinaturas: leitura por tenant, escrita so pelo sistema', () => {
  it('tenant A le a propria assinatura (query sem filtro)', async () => {
    const linhas = await db.comContexto(comoAdminA(), (trx) =>
      trx.selectFrom('assinaturas').selectAll().execute(),
    );
    expect(linhas.map((l) => l.id)).toEqual([fixtures.assinaturaA]);
  });

  it('tenant B nao enxerga a assinatura do tenant A', async () => {
    const linhas = await db.comContexto(comoAdminB(), (trx) =>
      trx.selectFrom('assinaturas').selectAll().execute(),
    );
    expect(linhas).toHaveLength(0);
  });

  it('superadmin enxerga assinaturas de todos os tenants', async () => {
    const linhas = await db.comContexto(comoSuperadmin(), (trx) =>
      trx.selectFrom('assinaturas').selectAll().where('id', '=', fixtures.assinaturaA).execute(),
    );
    expect(linhas).toHaveLength(1);
  });

  it('admin do tenant NAO consegue alterar a propria assinatura diretamente', async () => {
    // A escrita e sempre do sistema (checkout, webhook) — nunca de uma pessoa,
    // pelo mesmo motivo do status do tenant.
    //
    // Semantica de RLS: a politica de escrita (`for all`) e a UNICA que vale
    // para UPDATE — a de leitura e so `for select`, entao nao empresta
    // visibilidade aqui. Sem `app_e_global()`, a linha fica invisivel para o
    // UPDATE e o resultado e 0 linhas alteradas, SEM erro (nao ha WITH CHECK
    // pra violar se a linha nunca foi encontrada).
    const resultado = await db.comContexto(comoAdminA(), (trx) =>
      trx
        .updateTable('assinaturas')
        .set({ status: 'ativa' })
        .where('id', '=', fixtures.assinaturaA)
        .execute(),
    );
    expect(resultado[0].numUpdatedRows).toBe(0n);

    const aindaAtiva = await db.comContexto(comoSuperadmin(), (trx) =>
      trx
        .selectFrom('assinaturas')
        .select('status')
        .where('id', '=', fixtures.assinaturaA)
        .executeTakeFirstOrThrow(),
    );
    expect(aindaAtiva.status).toBe('ativa');
  });

  it('admin do tenant NAO consegue inserir assinatura para si mesmo', async () => {
    await expect(
      db.comContexto(comoAdminA(), (trx) =>
        trx
          .insertInto('assinaturas')
          .values({
            tenant_id: fixtures.tenantA,
            plano_id: fixtures.planoId,
            status: 'ativa',
          })
          .execute(),
      ),
    ).rejects.toThrow(/row-level security|duplicate key/i);
  });
});

describe('pagamentos: leitura por tenant, escrita so pelo sistema', () => {
  it('tenant A le o proprio historico de pagamentos', async () => {
    const linhas = await db.comContexto(comoAdminA(), (trx) =>
      trx.selectFrom('pagamentos').selectAll().execute(),
    );
    expect(linhas.length).toBeGreaterThan(0);
    expect(linhas.every((l) => l.tenant_id === fixtures.tenantA)).toBe(true);
  });

  it('tenant B nao enxerga pagamento do tenant A', async () => {
    const linhas = await db.comContexto(comoAdminB(), (trx) =>
      trx.selectFrom('pagamentos').selectAll().execute(),
    );
    expect(linhas).toHaveLength(0);
  });

  it('admin do tenant nao consegue forjar um pagamento confirmado', async () => {
    await expect(
      db.comContexto(comoAdminA(), (trx) =>
        trx
          .insertInto('pagamentos')
          .values({
            tenant_id: fixtures.tenantA,
            valor_centavos: 1,
            metodo: 'pix',
            status: 'confirmado',
          })
          .execute(),
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('config_plataforma: so superadmin e sistema, tenant nao existe para esta tabela', () => {
  it('admin de tenant nao ve nenhuma linha, mesmo sem filtro', async () => {
    const linhas = await db.comContexto(comoAdminA(), (trx) =>
      trx.selectFrom('config_plataforma').selectAll().execute(),
    );
    expect(linhas).toHaveLength(0);
  });

  it('admin de tenant nao consegue inserir configuracao', async () => {
    await expect(
      db.comContexto(comoAdminA(), (trx) =>
        trx
          .insertInto('config_plataforma')
          .values({
            chave: `invasao_${marca}`,
            ambiente: 'sandbox',
            credenciais_cifradas: 'x',
          })
          .execute(),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('superadmin ve a configuracao', async () => {
    const linhas = await db.comContexto(comoSuperadmin(), (trx) =>
      trx.selectFrom('config_plataforma').selectAll().where('chave', '=', `teste_${marca}`).execute(),
    );
    expect(linhas).toHaveLength(1);
  });

  it('o valor cifrado nunca aparece em claro na linha (sanity check do teste)', async () => {
    const linha = await db.comContexto(comoSuperadmin(), (trx) =>
      trx
        .selectFrom('config_plataforma')
        .selectAll()
        .where('chave', '=', `teste_${marca}`)
        .executeTakeFirstOrThrow(),
    );
    // Este teste guarda um valor ja "cifrado" (fake) de proposito — o ponto e
    // que a coluna nunca e nem deveria ser o JSON de credenciais em claro.
    expect(linha.credenciais_cifradas).not.toContain('apiKey');
  });
});
