/**
 * Testes de USO e de SEGURANCA da API, contra o servidor compilado.
 *
 * Estes testes batem HTTP de verdade no artefato que vai para o EasyPanel —
 * incluindo o guard global, os pipes de validacao e o RLS no banco.
 */
import { beforeAll, describe, expect, it } from 'vitest';

const BASE = 'http://localhost:3399/api';

const SENHA = 'rotulei-dev-2026';
const ADMIN = 'admin@mercadonunes.com.br';
const OPERADOR = 'operador@mercadonunes.com.br';
const SUPERADMIN = 'super@nxdigital.com.br';

async function post(caminho: string, corpo: unknown, token?: string) {
  return fetch(`${BASE}${caminho}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(corpo),
  });
}

async function get(caminho: string, token?: string) {
  return fetch(`${BASE}${caminho}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

async function entrar(email: string, senha = SENHA) {
  const r = await post('/auth/login', { email, senha });
  if (!r.ok) throw new Error(`login falhou para ${email}: ${r.status} ${await r.text()}`);
  return (await r.json()) as { accessToken: string; refreshToken: string; expiraEm: number };
}

describe('rotas publicas', () => {
  it('a API sobe conectada como rotulei_app, com RLS ativo', async () => {
    const r = await get('/saude');
    expect(r.status).toBe(200);

    const corpo = await r.json();
    expect(corpo.status).toBe('ok');
    // Se isto virar false, o isolamento entre tenants esta DESLIGADO.
    expect(corpo.rlsAtivo).toBe(true);
    expect(corpo.roleDaApi).toBe('rotulei_app');
  });

  it('o catalogo de planos e legivel sem login', async () => {
    const r = await get('/planos');
    expect(r.status).toBe(200);

    const planos = await r.json();
    expect(planos.map((p: { codigo: string }) => p.codigo).sort()).toEqual([
      'enterprise',
      'inicio',
      'rede',
    ]);
  });

  it('o plano Rede e marcado como cobranca por loja', async () => {
    const planos = await (await get('/planos')).json();
    const rede = planos.find((p: { codigo: string }) => p.codigo === 'rede');
    // Sem esta flag o MRR do painel superadmin sai errado para redes.
    expect(rede.precoPorLoja).toBe(true);
    expect(rede.precoMensalCentavos).toBe(6900);
  });
});

describe('toda rota nasce protegida', () => {
  it('sem token, uma rota autenticada responde 401', async () => {
    expect((await get('/auth/eu')).status).toBe(401);
  });

  it('token malformado responde 401', async () => {
    expect((await get('/auth/eu', 'nao-e-um-jwt')).status).toBe(401);
  });

  it('cabecalho sem "Bearer" responde 401', async () => {
    const r = await fetch(`${BASE}/auth/eu`, { headers: { Authorization: 'Token abc' } });
    expect(r.status).toBe(401);
  });
});

describe('login', () => {
  it('aceita credenciais corretas', async () => {
    const sessao = await entrar(ADMIN);
    expect(sessao.accessToken.split('.')).toHaveLength(3);
    expect(sessao.refreshToken.length).toBeGreaterThan(30);
    expect(sessao.expiraEm).toBe(15 * 60);
  });

  it('recusa senha errada', async () => {
    const r = await post('/auth/login', { email: ADMIN, senha: 'errada' });
    expect(r.status).toBe(401);
  });

  it('nao revela se o e-mail existe', async () => {
    // A mensagem tem de ser IGUAL nos dois casos, senao da para enumerar
    // quais e-mails tem conta no Rotulei.
    const inexistente = await post('/auth/login', { email: 'ninguem@x.com', senha: SENHA });
    const senhaErrada = await post('/auth/login', { email: ADMIN, senha: 'errada' });

    expect(inexistente.status).toBe(senhaErrada.status);
    expect((await inexistente.json()).message).toBe((await senhaErrada.json()).message);
  });

  it('valida o formato do e-mail antes de ir ao banco', async () => {
    const r = await post('/auth/login', { email: 'nao-e-email', senha: SENHA });
    expect(r.status).toBe(400);
  });

  it('recusa corpo sem senha', async () => {
    const r = await post('/auth/login', { email: ADMIN });
    expect(r.status).toBe(400);
  });

  it('o e-mail nao diferencia maiusculas', async () => {
    const r = await post('/auth/login', { email: ADMIN.toUpperCase(), senha: SENHA });
    expect(r.status).toBe(200);
  });
});

describe('o token carrega o tenant, e o cliente nao escolhe qual', () => {
  it('/auth/eu devolve o tenant vindo do JWT assinado', async () => {
    const { accessToken } = await entrar(ADMIN);
    const eu = await (await get('/auth/eu', accessToken)).json();

    expect(eu.papel).toBe('admin');
    expect(eu.tenantId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('superadmin nao pertence a tenant nenhum', async () => {
    const { accessToken } = await entrar(SUPERADMIN);
    const eu = await (await get('/auth/eu', accessToken)).json();

    expect(eu.papel).toBe('superadmin');
    expect(eu.tenantId).toBeNull();
  });

  it('o operador vem fixado na loja dele', async () => {
    const { accessToken } = await entrar(OPERADOR);
    const eu = await (await get('/auth/eu', accessToken)).json();

    expect(eu.papel).toBe('operador');
    expect(eu.lojaId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('um header de tenant forjado e ignorado', async () => {
    // O contexto de banco vem do JWT, nunca do request. Se viesse do header,
    // qualquer cliente escolheria o proprio tenant e o RLS obedeceria.
    const { accessToken } = await entrar(ADMIN);
    const legitimo = await (await get('/auth/eu', accessToken)).json();

    const r = await fetch(`${BASE}/auth/eu`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Tenant-Id': '00000000-0000-0000-0000-000000000000',
        'x-tenant': '00000000-0000-0000-0000-000000000000',
      },
    });
    expect((await r.json()).tenantId).toBe(legitimo.tenantId);
  });

  it('um JWT com assinatura adulterada e recusado', async () => {
    const { accessToken } = await entrar(OPERADOR);
    const [cabecalho, carga] = accessToken.split('.');

    // troca o papel para superadmin e reassina com lixo
    const claims = JSON.parse(Buffer.from(carga, 'base64url').toString());
    claims.papel = 'superadmin';
    claims.tid = null;
    const cargaFalsa = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const forjado = `${cabecalho}.${cargaFalsa}.assinaturafalsa`;

    expect((await get('/auth/eu', forjado)).status).toBe(401);
  });

  it('o algoritmo "none" nao e aceito', async () => {
    const cabecalho = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString(
      'base64url',
    );
    const carga = Buffer.from(
      JSON.stringify({ sub: 'x', tid: null, papel: 'superadmin', lid: null, iss: 'rotulei' }),
    ).toString('base64url');

    expect((await get('/auth/eu', `${cabecalho}.${carga}.`)).status).toBe(401);
  });
});

describe('refresh com rotacao', () => {
  it('troca o refresh por um par novo', async () => {
    const sessao = await entrar(ADMIN);
    const r = await post('/auth/refresh', { refreshToken: sessao.refreshToken });
    expect(r.status).toBe(200);

    const nova = await r.json();
    expect(nova.refreshToken).not.toBe(sessao.refreshToken);
    expect((await get('/auth/eu', nova.accessToken)).status).toBe(200);
  });

  it('reusar um refresh ja rotacionado derruba TODAS as sessoes do usuario', async () => {
    const primeira = await entrar(ADMIN);
    const segunda = await entrar(ADMIN); // outra sessao, outro dispositivo

    // rotacao normal da primeira
    const rotacionada = await (
      await post('/auth/refresh', { refreshToken: primeira.refreshToken })
    ).json();
    expect((await get('/auth/eu', rotacionada.accessToken)).status).toBe(200);

    // alguem apresenta o token ANTIGO: so pode ser copia
    const reuso = await post('/auth/refresh', { refreshToken: primeira.refreshToken });
    expect(reuso.status).toBe(401);

    // como nao da para saber quem e o atacante, a familia inteira cai —
    // inclusive a sessao legitima do outro dispositivo
    expect(
      (await post('/auth/refresh', { refreshToken: rotacionada.refreshToken })).status,
    ).toBe(401);
    expect((await post('/auth/refresh', { refreshToken: segunda.refreshToken })).status).toBe(
      401,
    );
  });

  it('refresh inventado e recusado', async () => {
    const r = await post('/auth/refresh', { refreshToken: 'a'.repeat(43) });
    expect(r.status).toBe(401);
  });

  it('depois do logout o refresh nao vale mais', async () => {
    const sessao = await entrar(OPERADOR);

    const saida = await post('/auth/logout', { refreshToken: sessao.refreshToken });
    expect(saida.status).toBe(204);

    expect((await post('/auth/refresh', { refreshToken: sessao.refreshToken })).status).toBe(
      401,
    );
  });

  it('logout funciona mesmo sem access token valido', async () => {
    // E justamente quando o token expirou que o usuario quer encerrar a sessao.
    const sessao = await entrar(OPERADOR);
    const r = await fetch(`${BASE}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer expirado' },
      body: JSON.stringify({ refreshToken: sessao.refreshToken }),
    });
    expect(r.status).toBe(204);
  });
});

describe('validacao de entrada', () => {
  it('campos desconhecidos sao descartados em vez de aceitos', async () => {
    const r = await post('/auth/login', {
      email: ADMIN,
      senha: SENHA,
      papel: 'superadmin', // tentativa de escalar papel pelo corpo
      tenantId: '00000000-0000-0000-0000-000000000000',
    });
    expect(r.status).toBe(200);

    const { accessToken } = await r.json();
    const eu = await (await get('/auth/eu', accessToken)).json();
    expect(eu.papel).toBe('admin'); // continua admin, nao superadmin
  });

  it('JSON malformado responde 400, nao 500', async () => {
    const r = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ nao e json',
    });
    expect(r.status).toBe(400);
  });
});
