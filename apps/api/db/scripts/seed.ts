/**
 * Popula o banco de desenvolvimento.
 *
 * Roda como rotulei_app com contexto 'sistema' — de proposito: se o seed
 * funcionar, o mecanismo de contexto + RLS que a API usa esta comprovadamente
 * de pe. Se rodasse como owner, nao provaria nada.
 *
 *   npm run db:seed
 */
import { Pool } from 'pg';
import * as argon2 from 'argon2';
import { precisaDe } from './env.js';
import { DIAS_DE_TRIAL } from '@rotulei/shared';

/**
 * Senha unica de desenvolvimento. NUNCA usada em producao: o seed so roda
 * contra o banco local, e o cadastro publico (item 4) define a senha real.
 */
const SENHA_DEV = 'rotulei-dev-2026';

const PLANOS = [
  {
    codigo: 'inicio',
    nome: 'Inicio',
    preco_mensal_centavos: 8900,
    preco_anual_centavos: 7400,
    preco_por_loja: false,
    limite_lojas: 1,
    recursos: { placas_ilimitadas: true, templates_sazonais: true, marca_propria: false },
  },
  {
    codigo: 'rede',
    nome: 'Rede',
    preco_mensal_centavos: 6900,
    preco_anual_centavos: null,
    preco_por_loja: true,
    limite_lojas: 5,
    recursos: { placas_ilimitadas: true, templates_sazonais: true, marca_propria: true, painel_multi_loja: true },
  },
  {
    codigo: 'enterprise',
    nome: 'Enterprise',
    preco_mensal_centavos: 0, // sob consulta
    preco_anual_centavos: null,
    preco_por_loja: true,
    limite_lojas: null,
    recursos: {
      placas_ilimitadas: true, templates_sazonais: true, marca_propria: true,
      painel_multi_loja: true, integracao_pdv: true, gerente_de_conta: true,
    },
  },
];

async function main() {
  const pool = new Pool({ connectionString: precisaDe('DATABASE_URL') });
  const cliente = await pool.connect();

  try {
    await cliente.query('begin');
    await cliente.query(
      `select set_config('app.tenant_id','',true),
              set_config('app.usuario_id','',true),
              set_config('app.papel','sistema',true)`,
    );

    for (const p of PLANOS) {
      await cliente.query(
        `insert into planos (codigo, nome, preco_mensal_centavos, preco_anual_centavos,
                             preco_por_loja, limite_lojas, recursos)
         values ($1,$2,$3,$4,$5,$6,$7)
         on conflict (codigo) do update set
           nome = excluded.nome,
           preco_mensal_centavos = excluded.preco_mensal_centavos,
           preco_anual_centavos  = excluded.preco_anual_centavos,
           preco_por_loja        = excluded.preco_por_loja,
           limite_lojas          = excluded.limite_lojas,
           recursos              = excluded.recursos`,
        [p.codigo, p.nome, p.preco_mensal_centavos, p.preco_anual_centavos,
         p.preco_por_loja, p.limite_lojas, JSON.stringify(p.recursos)],
      );
    }
    console.log(`planos: ${PLANOS.length} gravados`);

    const { rows: planoRede } = await cliente.query<{ id: string }>(
      `select id from planos where codigo = 'rede'`,
    );

    // Mercado Nunes: o cliente do MVP entra como um tenant qualquer.
    const { rows: tenant } = await cliente.query<{ id: string }>(
      `insert into tenants (nome, cnpj, slug, status, plano_id, trial_termina_em)
       values ('Mercado Nunes', '12345678000199', 'mercado-nunes', 'trial', $1, now() + ($2 || ' days')::interval)
       on conflict (slug) do update set nome = excluded.nome
       returning id`,
      [planoRede[0].id, DIAS_DE_TRIAL],
    );
    const tenantNunes = tenant[0].id;

    for (const loja of [
      { nome: 'Central', endereco: 'Centro' },
      { nome: 'Vila Moema', endereco: 'Vila Moema' },
    ]) {
      await cliente.query(
        `insert into lojas (tenant_id, nome, endereco) values ($1,$2,$3)
         on conflict do nothing`,
        [tenantNunes, loja.nome, loja.endereco],
      );
    }

    const senhaHash = await argon2.hash(SENHA_DEV, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    await cliente.query(
      `insert into usuarios (tenant_id, nome, email, papel, senha_hash)
       values ($1,$2,$3,'admin',$4)
       on conflict (email) do update set senha_hash = excluded.senha_hash`,
      [tenantNunes, 'Admin Nunes', 'admin@mercadonunes.com.br', senhaHash],
    );

    await cliente.query(
      `insert into usuarios (tenant_id, loja_id, nome, email, papel, senha_hash)
       select $1, l.id, 'Operador Central', 'operador@mercadonunes.com.br', 'operador', $2
         from lojas l where l.tenant_id = $1 and l.nome = 'Central'
       on conflict (email) do update set senha_hash = excluded.senha_hash`,
      [tenantNunes, senhaHash],
    );

    await cliente.query(
      `insert into usuarios (nome, email, papel, senha_hash)
       values ('Superadmin NX','super@nxdigital.com.br','superadmin',$1)
       on conflict (email) do update set senha_hash = excluded.senha_hash`,
      [senhaHash],
    );

    /*
     * Segundo tenant, so no ambiente local.
     *
     * Existe para que os testes de isolamento possam provar, por HTTP, que um
     * mercado nao enxerga dado do outro. Sem um vizinho de verdade no banco, o
     * teste de multi-tenancy so consegue afirmar "nao vi nada" — que tambem e
     * o resultado de uma consulta simplesmente vazia.
     */
    const { rows: planoInicio } = await cliente.query<{ id: string }>(
      `select id from planos where codigo = 'inicio'`,
    );

    const { rows: vizinho } = await cliente.query<{ id: string }>(
      `insert into tenants (nome, cnpj, slug, status, plano_id, trial_termina_em)
       values ('Mercado Vizinho', '98765432000188', 'mercado-vizinho', 'ativo', $1, null)
       on conflict (slug) do update set nome = excluded.nome
       returning id`,
      [planoInicio[0].id],
    );
    const tenantVizinho = vizinho[0].id;

    await cliente.query(
      `insert into lojas (tenant_id, nome, endereco) values ($1,'Matriz','Centro')
       on conflict do nothing`,
      [tenantVizinho],
    );

    await cliente.query(
      `insert into usuarios (tenant_id, nome, email, papel, senha_hash)
       values ($1,'Admin Vizinho','admin@mercadovizinho.com.br','admin',$2)
       on conflict (email) do update set senha_hash = excluded.senha_hash`,
      [tenantVizinho, senhaHash],
    );

    // Um cartaz de cada tenant — alvo dos testes de vazamento.
    await cliente.query(
      `insert into cartazes (tenant_id, produto, peso, preco)
       select $1, 'ARROZ NUNES', '5 KG', '22,99'
       where not exists (select 1 from cartazes where tenant_id = $1)`,
      [tenantNunes],
    );
    await cliente.query(
      `insert into cartazes (tenant_id, produto, peso, preco)
       select $1, 'FEIJAO VIZINHO', '1 KG', '8,49'
       where not exists (select 1 from cartazes where tenant_id = $1)`,
      [tenantVizinho],
    );

    await cliente.query('commit');
    console.log(`tenant: Mercado Nunes (${tenantNunes}) — 2 lojas, 2 usuarios`);
    console.log('superadmin: super@nxdigital.com.br');
    console.log(`tenant vizinho: Mercado Vizinho (${tenantVizinho}) — admin@mercadovizinho.com.br`);
    console.log(`senha de todos os usuarios do seed: ${SENHA_DEV}`);
    console.log('\nseed concluido.');
  } catch (erro) {
    await cliente.query('rollback');
    throw erro;
  } finally {
    cliente.release();
    await pool.end();
  }
}

main().catch((erro) => {
  console.error('\nseed falhou:', erro.message);
  process.exit(1);
});
