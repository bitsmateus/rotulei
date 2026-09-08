/**
 * O job diario que fecha o trial vencido (Opcao B — DECISOES.md #18).
 *
 * Chama o metodo direto, sem o SchedulerRegistry do Nest por tras — o
 * decorator @Cron so importa em producao; aqui o que se testa e a LOGICA.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { criarKysely, criarPool } from '../../src/database/pool';
import { ContextoDbService } from '../../src/database/contexto-db.service';
import { TrialService } from '../../src/modules/trial/trial.service';

config({ path: resolve(process.cwd(), '../../.env'), quiet: true });

let pool: Pool;
let db: ContextoDbService;
let job: TrialService;

const marca = `tj${Date.now().toString(36)}`;
const fixtures = { planoId: '', tenantVencido: '', tenantNoPrazo: '', tenantJaAtivo: '' };

const cnpjFake = (sufixo: number) =>
  (Date.now().toString() + String(sufixo)).slice(-14).padStart(14, '5');

beforeAll(async () => {
  pool = criarPool(process.env.DATABASE_URL!, 3);
  db = new ContextoDbService(criarKysely(pool));
  job = new TrialService(db);

  await db.comoSistema('fixtures trial-job', async (trx) => {
    const plano = await trx.selectFrom('planos').select('id').where('codigo', '=', 'inicio').executeTakeFirstOrThrow();
    fixtures.planoId = plano.id;

    const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const amanha = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const vencido = await trx
      .insertInto('tenants')
      .values({
        nome: `Trial Vencido ${marca}`, cnpj: cnpjFake(1), slug: `trial-vencido-${marca}`,
        status: 'trial', plano_id: fixtures.planoId, trial_termina_em: ontem,
      })
      .returning('id').executeTakeFirstOrThrow();
    fixtures.tenantVencido = vencido.id;

    const noPrazo = await trx
      .insertInto('tenants')
      .values({
        nome: `Trial No Prazo ${marca}`, cnpj: cnpjFake(2), slug: `trial-prazo-${marca}`,
        status: 'trial', plano_id: fixtures.planoId, trial_termina_em: amanha,
      })
      .returning('id').executeTakeFirstOrThrow();
    fixtures.tenantNoPrazo = noPrazo.id;

    // Ja ativo com data de trial no passado (pagou antes do fim) — o job NAO
    // pode mexer nele, so tenants ainda em 'trial'.
    const jaAtivo = await trx
      .insertInto('tenants')
      .values({
        nome: `Ja Ativo ${marca}`, cnpj: cnpjFake(3), slug: `ja-ativo-${marca}`,
        status: 'ativo', plano_id: fixtures.planoId, trial_termina_em: ontem,
      })
      .returning('id').executeTakeFirstOrThrow();
    fixtures.tenantJaAtivo = jaAtivo.id;
  });
});

afterAll(async () => {
  await db?.comoSistema('limpeza trial-job', (trx) =>
    trx.deleteFrom('tenants').where('id', 'in', [fixtures.tenantVencido, fixtures.tenantNoPrazo, fixtures.tenantJaAtivo]).execute(),
  );
  await pool?.end();
});

describe('TrialService.encerrarTriaisVencidos', () => {
  it('vira inadimplente so quem esta em trial E com o prazo vencido', async () => {
    await job.encerrarTriaisVencidos();

    const status = await db.comoSistema('verificar', (trx) =>
      trx.selectFrom('tenants').select(['id', 'status']).where('id', 'in', [
        fixtures.tenantVencido, fixtures.tenantNoPrazo, fixtures.tenantJaAtivo,
      ]).execute(),
    );
    const porId = Object.fromEntries(status.map((t) => [t.id, t.status]));

    expect(porId[fixtures.tenantVencido]).toBe('inadimplente');
    expect(porId[fixtures.tenantNoPrazo]).toBe('trial'); // ainda dentro do prazo
    expect(porId[fixtures.tenantJaAtivo]).toBe('ativo'); // nao mexe em quem ja pagou
  });

  it('rodar de novo e idempotente — nao reprocessa quem ja virou inadimplente', async () => {
    await job.encerrarTriaisVencidos();
    const t = await db.comoSistema('verificar 2', (trx) =>
      trx.selectFrom('tenants').select('status').where('id', '=', fixtures.tenantVencido).executeTakeFirstOrThrow(),
    );
    expect(t.status).toBe('inadimplente');
  });
});
