/**
 * Painel superadmin (item 6) — lista de tenants, MRR, suspender/reativar,
 * edicao de preco de plano. ESCOPO.md, secao Superadmin.
 */
import { beforeAll, describe, expect, it } from 'vitest';

const BASE = `http://localhost:${process.env.ROTULEI_TEST_PORT ?? 3399}/api`;

async function post(caminho: string, corpo: unknown, token?: string, method = 'POST') {
  return fetch(`${BASE}${caminho}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(corpo),
  });
}
async function get(caminho: string, token?: string) {
  return fetch(`${BASE}${caminho}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
}
async function entrar(email: string) {
  const r = await post('/auth/login', { email, senha: 'rotulei-dev-2026' });
  return (await r.json()).accessToken as string;
}

let tokenSuperadmin: string;
let tokenAdmin: string;
let tenantNunesId: string;
let planoInicioId: string;

beforeAll(async () => {
  tokenSuperadmin = await entrar('super@nxdigital.com.br');
  tokenAdmin = await entrar('admin@mercadonunes.com.br');

  const tenants = await (await get('/admin/tenants', tokenSuperadmin)).json();
  tenantNunesId = tenants.find((t: { nome: string }) => t.nome === 'Mercado Nunes').id;

  const planos = await (await get('/admin/planos', tokenSuperadmin)).json();
  planoInicioId = planos.find((p: { codigo: string }) => p.codigo === 'inicio').id;
});

describe('acesso restrito a superadmin', () => {
  it('admin de tenant nao acessa a lista de tenants (403)', async () => {
    expect((await get('/admin/tenants', tokenAdmin)).status).toBe(403);
  });

  it('admin de tenant nao acessa metricas (403)', async () => {
    expect((await get('/admin/metricas', tokenAdmin)).status).toBe(403);
  });

  it('admin de tenant nao consegue suspender ninguem (403)', async () => {
    const r = await post(`/admin/tenants/${tenantNunesId}/status`, { status: 'suspenso' }, tokenAdmin, 'PATCH');
    expect(r.status).toBe(403);
  });

  it('admin de tenant nao acessa planos administrativos (403)', async () => {
    expect((await get('/admin/planos', tokenAdmin)).status).toBe(403);
  });

  it('sem token, 401 em todas as rotas', async () => {
    expect((await get('/admin/tenants')).status).toBe(401);
    expect((await get('/admin/metricas')).status).toBe(401);
    expect((await get('/admin/planos')).status).toBe(401);
  });
});

describe('lista de tenants', () => {
  it('inclui plano, quantidade de lojas e MRR', async () => {
    const tenants = await (await get('/admin/tenants', tokenSuperadmin)).json();
    const nunes = tenants.find((t: { id: string }) => t.id === tenantNunesId);

    expect(nunes).toBeDefined();
    expect(nunes.plano.codigo).toBe('rede');
    expect(nunes.qtdLojas).toBe(2);
    expect(typeof nunes.mrrCentavos).toBe('number');
  });

  it('tenant fora do status ativo tem MRR zero', async () => {
    const tenants = await (await get('/admin/tenants', tokenSuperadmin)).json();
    const foraDeAtivo = tenants.filter((t: { status: string }) => t.status !== 'ativo');
    for (const t of foraDeAtivo) expect(t.mrrCentavos).toBe(0);
  });
});

describe('metricas agregadas', () => {
  it('mrrTotalCentavos bate com a soma dos tenants ativos', async () => {
    const [tenants, metricas] = await Promise.all([
      get('/admin/tenants', tokenSuperadmin).then((r) => r.json()),
      get('/admin/metricas', tokenSuperadmin).then((r) => r.json()),
    ]);
    const somaEsperada = tenants
      .filter((t: { status: string }) => t.status === 'ativo')
      .reduce((soma: number, t: { mrrCentavos: number }) => soma + t.mrrCentavos, 0);

    expect(metricas.mrrTotalCentavos).toBe(somaEsperada);
    expect(metricas.tenantsAtivos + metricas.tenantsEmTrial + metricas.tenantsInadimplentes +
      metricas.tenantsSuspensos + metricas.tenantsCancelados).toBe(tenants.length);
  });
});

describe('suspender e reativar manualmente', () => {
  it('suspende, confere que o acesso do tenant cai, e reativa de novo', async () => {
    const suspenso = await post(`/admin/tenants/${tenantNunesId}/status`, { status: 'suspenso' }, tokenSuperadmin, 'PATCH');
    expect(suspenso.status).toBe(200);
    expect((await suspenso.json()).status).toBe('suspenso');

    // 'suspenso' nao esta em STATUS_QUE_PODE_LOGAR — nem o login do admin funciona.
    const loginBloqueado = await post('/auth/login', { email: 'admin@mercadonunes.com.br', senha: 'rotulei-dev-2026' });
    expect(loginBloqueado.status).toBe(403);

    const reativado = await post(`/admin/tenants/${tenantNunesId}/status`, { status: 'ativo' }, tokenSuperadmin, 'PATCH');
    expect(reativado.status).toBe(200);
    expect((await reativado.json()).status).toBe('ativo');

    // login volta a funcionar
    expect((await post('/auth/login', { email: 'admin@mercadonunes.com.br', senha: 'rotulei-dev-2026' })).status).toBe(200);
  });

  it('rejeita status invalido', async () => {
    const r = await post(`/admin/tenants/${tenantNunesId}/status`, { status: 'inventado' }, tokenSuperadmin, 'PATCH');
    expect(r.status).toBe(400);
  });

  it('tenant inexistente responde 404', async () => {
    const r = await post('/admin/tenants/00000000-0000-0000-0000-000000000000/status', { status: 'ativo' }, tokenSuperadmin, 'PATCH');
    expect(r.status).toBe(404);
  });
});

describe('edicao de plano', () => {
  it('superadmin edita preco e o catalogo publico reflete na hora', async () => {
    const r = await post(`/admin/planos/${planoInicioId}`, { precoMensalCentavos: 12345 }, tokenSuperadmin, 'PATCH');
    expect(r.status).toBe(200);
    expect((await r.json()).precoMensalCentavos).toBe(12345);

    const publico = await (await get('/planos')).json();
    expect(publico.find((p: { codigo: string }) => p.codigo === 'inicio').precoMensalCentavos).toBe(12345);
  });

  it('editar so um campo nao apaga os demais', async () => {
    const antes = await (await get('/admin/planos', tokenSuperadmin)).json();
    const planoAntes = antes.find((p: { id: string }) => p.id === planoInicioId);

    await post(`/admin/planos/${planoInicioId}`, { ativo: false }, tokenSuperadmin, 'PATCH');

    const depois = await (await get('/admin/planos', tokenSuperadmin)).json();
    const planoDepois = depois.find((p: { id: string }) => p.id === planoInicioId);

    expect(planoDepois.ativo).toBe(false);
    expect(planoDepois.precoMensalCentavos).toBe(planoAntes.precoMensalCentavos);
    expect(planoDepois.nome).toBe(planoAntes.nome);

    // devolve pro estado ativo para nao quebrar outros testes (cadastro publico
    // depende do plano 'inicio' estar ativo).
    await post(`/admin/planos/${planoInicioId}`, { ativo: true }, tokenSuperadmin, 'PATCH');
  });

  it('plano inativo some do catalogo publico', async () => {
    await post(`/admin/planos/${planoInicioId}`, { ativo: false }, tokenSuperadmin, 'PATCH');

    const publico = await (await get('/planos')).json();
    expect(publico.find((p: { codigo: string }) => p.codigo === 'inicio')).toBeUndefined();

    await post(`/admin/planos/${planoInicioId}`, { ativo: true }, tokenSuperadmin, 'PATCH');
  });

  it('plano inexistente responde 404', async () => {
    const r = await post('/admin/planos/00000000-0000-0000-0000-000000000000', { ativo: true }, tokenSuperadmin, 'PATCH');
    expect(r.status).toBe(404);
  });
});
