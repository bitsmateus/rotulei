/**
 * Opcao B (DECISOES.md #18): quando o tenant fica inadimplente, o LOGIN
 * continua funcionando (o admin precisa entrar pra pagar), mas toda rota de
 * negocio responde 402 — exceto as marcadas @PermiteQuandoBloqueado().
 *
 * Mistura HTTP (contra o servidor compilado) com acesso direto ao banco
 * (para simular a passagem do tempo/o job de fim de trial), porque nao existe
 * nenhum endpoint HTTP que deixe um tenant inadimplente por si so.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import type { Pool } from 'pg';
import { criarKysely, criarPool } from '../src/database/pool';
import { ContextoDbService } from '../src/database/contexto-db.service';
import { cnpjValido, cpfValido, telefoneValido } from './documentos-teste';

config({ path: resolve(process.cwd(), '../../.env'), quiet: true });

const BASE = 'http://localhost:3399/api';
const SENHA = 'senha-bem-forte-para-teste-123';

async function post(caminho: string, corpo: unknown, token?: string) {
  return fetch(`${BASE}${caminho}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(corpo),
  });
}
async function get(caminho: string, token?: string) {
  return fetch(`${BASE}${caminho}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
}

let pool: Pool;
let db: ContextoDbService;

const marca = `bl${Date.now().toString(36)}`;
const semente = Date.now() % 1_000_000;
const email = `bloqueio.${marca}@teste.com`;
const cnpj = cnpjValido(semente);
const cpf = cpfValido(semente);
const telefone = telefoneValido(semente);

let tenantId: string;
let accessToken: string;
let refreshToken: string;

beforeAll(async () => {
  pool = criarPool(process.env.DATABASE_URL!, 3);
  db = new ContextoDbService(criarKysely(pool));

  const cadastro = await post('/public/cadastro', {
    nomeMercado: `Mercado Bloqueio ${marca}`,
    cnpj,
    nomeAdmin: 'Admin Bloqueio',
    cpf,
    telefone,
    email,
    senha: SENHA,
    planoCodigo: 'inicio',
  });
  const corpo = await cadastro.json();
  tenantId = corpo.tenantId;
  accessToken = corpo.accessToken;
  refreshToken = corpo.refreshToken;

  // Simula o job de fim de trial (TrialService.encerrarTriaisVencidos): o
  // relogio venceu, o tenant vira inadimplente.
  await db.comoSistema('teste: simular fim de trial', (trx) =>
    trx.updateTable('tenants').set({ status: 'inadimplente' }).where('id', '=', tenantId).execute(),
  );
});

afterAll(async () => {
  await db?.comoSistema('teste: limpeza bloqueio', (trx) =>
    trx.deleteFrom('tenants').where('id', '=', tenantId).execute(),
  );
  await pool?.end();
});

describe('tenant inadimplente ainda consegue logar', () => {
  it('login funciona (nao e negado por status)', async () => {
    const r = await post('/auth/login', { email, senha: SENHA });
    expect(r.status).toBe(200);
  });

  it('o access token emitido ANTES do bloqueio continua bloqueado=false (janela de defasagem)', async () => {
    // O token foi assinado no cadastro, quando o tenant ainda era 'trial'.
    // O bloqueio so aparece apos a proxima renovacao — mesmo compromisso ja
    // aceito para suspensao via webhook (ate ACCESS_TOKEN_MINUTOS de atraso).
    const eu = await (await get('/auth/eu', accessToken)).json();
    expect(eu.bloqueado).toBe(false);
  });

  it('refresh continua funcionando e o novo token tambem vem bloqueado', async () => {
    const r = await post('/auth/refresh', { refreshToken });
    expect(r.status).toBe(200);
    const novo = await r.json();
    accessToken = novo.accessToken;
    refreshToken = novo.refreshToken;

    const eu = await (await get('/auth/eu', accessToken)).json();
    expect(eu.bloqueado).toBe(true);
  });
});

describe('rotas de negocio ficam fechadas (402)', () => {
  it('GET /tenant/cartazes -> 402', async () => {
    const r = await get('/tenant/cartazes', accessToken);
    expect(r.status).toBe(402);
  });

  it('POST /tenant/cartazes -> 402', async () => {
    const r = await post('/tenant/cartazes', { produto: 'X' }, accessToken);
    expect(r.status).toBe(402);
  });
});

describe('rotas de auth e de assinatura continuam abertas', () => {
  it('GET /auth/eu -> 200 (marcada @PermiteQuandoBloqueado)', async () => {
    expect((await get('/auth/eu', accessToken)).status).toBe(200);
  });

  it('POST /auth/logout-total -> 204', async () => {
    // Faz por ultimo dentro deste describe seria mais limpo, mas o teste de
    // refresh acima ja fecha as sessoes anteriores; aqui so confirma que a
    // ROTA em si nao e bloqueada pelo guard de inadimplencia.
    const login = await post('/auth/login', { email, senha: SENHA });
    const { accessToken: tokenFresco } = await login.json();
    expect((await post('/auth/logout-total', {}, tokenFresco)).status).toBe(204);
  });

  it('GET /tenant/assinatura -> 200 (rota do proprio desbloqueio)', async () => {
    const login = await post('/auth/login', { email, senha: SENHA });
    const { accessToken: tokenFresco } = await login.json();

    const r = await get('/tenant/assinatura', tokenFresco);
    expect(r.status).toBe(200);
    const corpo = await r.json();
    expect(corpo.statusTenant).toBe('inadimplente');
  });

  it('POST /tenant/assinatura/checkout -> nao e 402 (o guard deixa passar; falha por outro motivo se o Asaas nao estiver configurado)', async () => {
    const login = await post('/auth/login', { email, senha: SENHA });
    const { accessToken: tokenFresco } = await login.json();

    const r = await post('/tenant/assinatura/checkout', {}, tokenFresco);
    // O ponto deste teste e o guard, nao o Asaas: 402 seria o guard barrando
    // por engano a propria rota de desbloqueio. Qualquer outra coisa (400 sem
    // config, 500 de rede em sandbox, 201 se configurado) prova que passou.
    expect(r.status).not.toBe(402);
  });
});

describe('tenant volta a funcionar quando o sistema reativa (simulando pagamento confirmado)', () => {
  it('apos status=ativo, o proximo refresh derruba o bloqueio', async () => {
    await db.comoSistema('teste: simular pagamento confirmado', (trx) =>
      trx.updateTable('tenants').set({ status: 'ativo' }).where('id', '=', tenantId).execute(),
    );

    const login = await post('/auth/login', { email, senha: SENHA });
    const { accessToken: tokenNovo } = await login.json();

    const eu = await (await get('/auth/eu', tokenNovo)).json();
    expect(eu.bloqueado).toBe(false);
    expect((await get('/tenant/cartazes', tokenNovo)).status).toBe(200);
  });
});
