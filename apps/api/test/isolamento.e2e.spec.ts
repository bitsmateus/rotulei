/**
 * Isolamento entre tenants visto de FORA, pela API.
 *
 * O teste de db/tests/isolamento.spec.ts prova o RLS no banco. Este prova a
 * mesma coisa pela porta por onde o cliente entra: HTTP, com JWT de verdade,
 * atravessando guard, contexto de sessao e politicas.
 *
 * Existem dois tenants no seed local (Mercado Nunes e Mercado Vizinho), cada um
 * com um cartaz. Sem um vizinho de verdade, "nao vi nada" seria indistinguivel
 * de um banco vazio.
 */
import { beforeAll, describe, expect, it } from 'vitest';

const BASE = `http://localhost:${process.env.ROTULEI_TEST_PORT ?? 3399}/api`;
const SENHA = 'rotulei-dev-2026';

const CONTAS = {
  nunes: 'admin@mercadonunes.com.br',
  operadorNunes: 'operador@mercadonunes.com.br',
  vizinho: 'admin@mercadovizinho.com.br',
  super: 'super@nxdigital.com.br',
};

async function req(caminho: string, opcoes: RequestInit & { token?: string } = {}) {
  const { token, ...resto } = opcoes;
  return fetch(`${BASE}${caminho}`, {
    ...resto,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(resto.headers ?? {}),
    },
  });
}

async function entrar(email: string): Promise<string> {
  const r = await req('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, senha: SENHA }),
  });
  if (!r.ok) throw new Error(`login falhou para ${email}: ${r.status}`);
  return (await r.json()).accessToken;
}

let tokenNunes: string;
let tokenOperador: string;
let tokenVizinho: string;
let tokenSuper: string;

let cartazDoNunes: string;
let cartazDoVizinho: string;

beforeAll(async () => {
  [tokenNunes, tokenOperador, tokenVizinho, tokenSuper] = await Promise.all([
    entrar(CONTAS.nunes),
    entrar(CONTAS.operadorNunes),
    entrar(CONTAS.vizinho),
    entrar(CONTAS.super),
  ]);

  const doNunes = await (await req('/tenant/cartazes', { token: tokenNunes })).json();
  const doVizinho = await (await req('/tenant/cartazes', { token: tokenVizinho })).json();

  cartazDoNunes = doNunes[0].id;
  cartazDoVizinho = doVizinho[0].id;
});

describe('cada tenant so enxerga os proprios cartazes', () => {
  it.each(['-1', 'NaN', 'Infinity', '1.5', '0', ''])('limite invalido %s responde 400', async limite => {
    expect((await req(`/tenant/cartazes?limite=${limite}`, { token: tokenNunes })).status).toBe(400);
  });

  it('produto composto por espacos responde 400', async () => {
    expect((await req('/tenant/cartazes', { token: tokenNunes, method: 'POST', body: JSON.stringify({ produto: '   ' }) })).status).toBe(400);
  });

  it('operador nao acessa cobranca nem inicia checkout', async () => {
    expect((await req('/tenant/assinatura', { token: tokenOperador })).status).toBe(403);
    expect((await req('/tenant/assinatura/checkout', { token: tokenOperador, method: 'POST', body: '{}' })).status).toBe(403);
  });
  it('a listagem do Nunes nao traz nada do Vizinho', async () => {
    const cartazes = await (await req('/tenant/cartazes', { token: tokenNunes })).json();

    expect(cartazes.length).toBeGreaterThan(0);
    expect(cartazes.map((c: { produto: string }) => c.produto)).toContain('ARROZ NUNES');
    expect(cartazes.map((c: { produto: string }) => c.produto)).not.toContain(
      'FEIJAO VIZINHO',
    );
  });

  it('a listagem do Vizinho nao traz nada do Nunes', async () => {
    const cartazes = await (await req('/tenant/cartazes', { token: tokenVizinho })).json();

    expect(cartazes.map((c: { produto: string }) => c.produto)).toContain('FEIJAO VIZINHO');
    expect(cartazes.map((c: { produto: string }) => c.produto)).not.toContain('ARROZ NUNES');
  });

  it('os dois tenants tem cartazes diferentes — o teste nao esta olhando um banco vazio', () => {
    expect(cartazDoNunes).toBeTruthy();
    expect(cartazDoVizinho).toBeTruthy();
    expect(cartazDoNunes).not.toBe(cartazDoVizinho);
  });
});

describe('acesso direto por id de outro tenant', () => {
  it('GET devolve 404, nao 403', async () => {
    const r = await req(`/tenant/cartazes/${cartazDoVizinho}`, { token: tokenNunes });
    // 403 confirmaria que o id existe — isso ja e vazamento de informacao.
    expect(r.status).toBe(404);
  });

  it('o proprio dono continua enxergando o mesmo id', async () => {
    const r = await req(`/tenant/cartazes/${cartazDoVizinho}`, { token: tokenVizinho });
    expect(r.status).toBe(200);
    expect((await r.json()).produto).toBe('FEIJAO VIZINHO');
  });

  it('PUT em cartaz de outro tenant nao altera nada', async () => {
    const r = await req(`/tenant/cartazes/${cartazDoVizinho}`, {
      method: 'PUT',
      token: tokenNunes,
      body: JSON.stringify({ produto: 'INVADIDO' }),
    });
    expect(r.status).toBe(404);

    const original = await (
      await req(`/tenant/cartazes/${cartazDoVizinho}`, { token: tokenVizinho })
    ).json();
    expect(original.produto).toBe('FEIJAO VIZINHO');
  });

  it('DELETE em cartaz de outro tenant nao apaga nada', async () => {
    const r = await req(`/tenant/cartazes/${cartazDoVizinho}`, {
      method: 'DELETE',
      token: tokenNunes,
    });
    expect(r.status).toBe(404);

    const aindaExiste = await req(`/tenant/cartazes/${cartazDoVizinho}`, {
      token: tokenVizinho,
    });
    expect(aindaExiste.status).toBe(200);
  });
});

describe('criacao nao aceita tenant escolhido pelo cliente', () => {
  it('o cartaz criado fica no tenant do TOKEN, ignorando o corpo', async () => {
    const vizinhoAntes = await (
      await req('/tenant/cartazes', { token: tokenVizinho })
    ).json();

    const r = await req('/tenant/cartazes', {
      method: 'POST',
      token: tokenNunes,
      body: JSON.stringify({
        produto: 'TENTATIVA DE INVASAO',
        // campos que um cliente malicioso tentaria injetar
        tenantId: vizinhoAntes[0].tenantId,
        tenant_id: vizinhoAntes[0].tenantId,
        criadoPor: '00000000-0000-0000-0000-000000000000',
      }),
    });
    expect(r.status).toBe(201);

    const criado = await r.json();
    const eu = await (await req('/auth/eu', { token: tokenNunes })).json();

    // Foi para o tenant do Nunes, nao para o do Vizinho.
    expect(criado.tenantId).toBe(eu.tenantId);
    expect(criado.tenantId).not.toBe(vizinhoAntes[0].tenantId);

    const vizinhoDepois = await (
      await req('/tenant/cartazes', { token: tokenVizinho })
    ).json();
    expect(vizinhoDepois).toHaveLength(vizinhoAntes.length);

    await req(`/tenant/cartazes/${criado.id}`, { method: 'DELETE', token: tokenNunes });
  });

  it('o criador registrado e o dono do token, nao o que veio no corpo', async () => {
    const r = await req('/tenant/cartazes', {
      method: 'POST',
      token: tokenOperador,
      body: JSON.stringify({ produto: 'CRIADO PELO OPERADOR' }),
    });
    const criado = await r.json();
    const eu = await (await req('/auth/eu', { token: tokenOperador })).json();

    expect(criado.criadoPor).toBe(eu.id);
    // Operador fixado numa loja carimba a loja dele automaticamente.
    expect(criado.lojaId).toBe(eu.lojaId);

    await req(`/tenant/cartazes/${criado.id}`, { method: 'DELETE', token: tokenOperador });
  });
});

describe('papeis', () => {
  it('operador cria e imprime cartaz — e o trabalho dele', async () => {
    const r = await req('/tenant/cartazes', {
      method: 'POST',
      token: tokenOperador,
      body: JSON.stringify({ produto: 'BANANA', preco: '5,99' }),
    });
    expect(r.status).toBe(201);
    const criado = await r.json();

    expect((await req(`/tenant/cartazes/${criado.id}`, { token: tokenOperador })).status).toBe(
      200,
    );

    await req(`/tenant/cartazes/${criado.id}`, { method: 'DELETE', token: tokenOperador });
  });

  it('superadmin sem tenant nao consegue criar cartaz sem escolher um', async () => {
    // tenant_id NOT NULL + tenantId null no token = a insercao falha.
    // Isso e correto: superadmin administra tenants, nao trabalha dentro deles.
    const r = await req('/tenant/cartazes', {
      method: 'POST',
      token: tokenSuper,
      body: JSON.stringify({ produto: 'X' }),
    });
    expect(r.status).toBeGreaterThanOrEqual(400);
  });
});

describe('validacao de entrada nos cartazes', () => {
  it('recusa produto vazio', async () => {
    const r = await req('/tenant/cartazes', {
      method: 'POST',
      token: tokenNunes,
      body: JSON.stringify({ produto: '' }),
    });
    expect(r.status).toBe(400);
  });

  it('recusa tema fora da lista fechada', async () => {
    // O tema vira CSS no cartaz impresso: valor livre aqui seria injecao.
    const r = await req('/tenant/cartazes', {
      method: 'POST',
      token: tokenNunes,
      body: JSON.stringify({ produto: 'X', temaId: 'url(javascript:alert(1))' }),
    });
    expect(r.status).toBe(400);
  });

  it('recusa fonte fora da lista fechada', async () => {
    const r = await req('/tenant/cartazes', {
      method: 'POST',
      token: tokenNunes,
      body: JSON.stringify({ produto: 'X', fonte: 'Comic Sans MS' }),
    });
    expect(r.status).toBe(400);
  });

  it('recusa ajuste fora do intervalo -3..+3', async () => {
    const r = await req('/tenant/cartazes', {
      method: 'POST',
      token: tokenNunes,
      body: JSON.stringify({ produto: 'X', ajustePreco: 99 }),
    });
    expect(r.status).toBe(400);
  });

  it('id que nao e UUID responde 400, nao 500', async () => {
    const r = await req('/tenant/cartazes/nao-e-uuid', { token: tokenNunes });
    expect(r.status).toBe(400);
  });

  it('guarda o texto do produto como veio, sem executar nada', async () => {
    const veneno = '<script>alert(1)</script>';
    const criado = await (
      await req('/tenant/cartazes', {
        method: 'POST',
        token: tokenNunes,
        body: JSON.stringify({ produto: veneno }),
      })
    ).json();

    // O React escapa na renderizacao; o banco guarda o texto literal. O que
    // importa e nao haver interpolacao de SQL no caminho.
    expect(criado.produto).toBe(veneno);

    await req(`/tenant/cartazes/${criado.id}`, { method: 'DELETE', token: tokenNunes });
  });

  it('aspas simples no produto nao quebram a query', async () => {
    const nome = "ARROZ D'ORO '); drop table cartazes; --";
    const criado = await (
      await req('/tenant/cartazes', {
        method: 'POST',
        token: tokenNunes,
        body: JSON.stringify({ produto: nome }),
      })
    ).json();

    expect(criado.produto).toBe(nome);

    // a tabela continua de pe
    expect((await req('/tenant/cartazes', { token: tokenNunes })).status).toBe(200);

    await req(`/tenant/cartazes/${criado.id}`, { method: 'DELETE', token: tokenNunes });
  });
});
