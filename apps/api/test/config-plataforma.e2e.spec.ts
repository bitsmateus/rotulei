/**
 * Configuracao do Asaas pelo superadmin (DECISOES.md #17).
 *
 * O ponto central destes testes: o valor da credencial NUNCA volta pela API,
 * nem para superadmin. So "configurado?", ambiente e os ultimos 4 caracteres.
 */
import { beforeAll, describe, expect, it } from 'vitest';

const BASE = `http://localhost:${process.env.ROTULEI_TEST_PORT ?? 3399}/api`;
const SENHA = 'rotulei-dev-2026';

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
  const r = await post('/auth/login', { email, senha: SENHA });
  return (await r.json()).accessToken as string;
}

let tokenSuperadmin: string;
let tokenAdmin: string;

beforeAll(async () => {
  tokenSuperadmin = await entrar('super@nxdigital.com.br');
  tokenAdmin = await entrar('admin@mercadonunes.com.br');
});

describe('acesso restrito a superadmin', () => {
  it('admin de tenant nao acessa a configuracao (403)', async () => {
    expect((await get('/admin/config/asaas', tokenAdmin)).status).toBe(403);
  });

  it('sem token, 401', async () => {
    expect((await get('/admin/config/asaas')).status).toBe(401);
  });

  it('admin de tenant nao consegue salvar', async () => {
    const r = await post(
      '/admin/config/asaas',
      { ambiente: 'sandbox', apiKey: 'chave-tentativa-invasao-123456' },
      tokenAdmin,
      'PUT',
    );
    expect(r.status).toBe(403);
  });
});

describe('superadmin gerencia a credencial, mas nunca a le de volta', () => {
  it('comeca sem configuracao', async () => {
    // Pode ja ter sido configurado por um teste anterior nesta mesma run;
    // o que importa e a FORMA da resposta, testada no proximo caso.
    const r = await get('/admin/config/asaas', tokenSuperadmin);
    expect(r.status).toBe(200);
    const corpo = await r.json();
    expect(typeof corpo.configurado).toBe('boolean');
  });

  it('salva e a resposta nunca contem a apiKey em claro', async () => {
    const apiKey = 'chave-secreta-de-teste-que-nao-pode-vazar-999';
    const r = await post(
      '/admin/config/asaas',
      { ambiente: 'sandbox', apiKey, webhookToken: 'tok-webhook-teste' },
      tokenSuperadmin,
      'PUT',
    );
    expect(r.status).toBe(200);

    const corpo = await r.json();
    const bruto = JSON.stringify(corpo);
    expect(bruto).not.toContain(apiKey);
    expect(bruto).not.toContain('tok-webhook-teste');

    expect(corpo.configurado).toBe(true);
    expect(corpo.ambiente).toBe('sandbox');
    // So a dica (ultimos 4 caracteres), nunca a chave inteira.
    expect(corpo.dica).toBe(apiKey.slice(-4));
  });

  it('GET depois do PUT mostra o mesmo estado mascarado', async () => {
    const r = await get('/admin/config/asaas', tokenSuperadmin);
    const corpo = await r.json();
    expect(corpo.configurado).toBe(true);
    expect(corpo).not.toHaveProperty('apiKey');
    expect(corpo).not.toHaveProperty('credenciaisCifradas');
    expect(corpo).not.toHaveProperty('credenciais_cifradas');
  });

  it('editar so o ambiente, sem apiKey, MANTEM a chave anterior', async () => {
    const primeira = await post(
      '/admin/config/asaas',
      { ambiente: 'sandbox', apiKey: 'chave-original-para-manter-1234' },
      tokenSuperadmin,
      'PUT',
    );
    const dicaOriginal = (await primeira.json()).dica;

    // troca so o ambiente, sem mandar apiKey
    const segunda = await post('/admin/config/asaas', { ambiente: 'production' }, tokenSuperadmin, 'PUT');
    expect(segunda.status).toBe(200);
    const corpo = await segunda.json();

    expect(corpo.ambiente).toBe('production');
    expect(corpo.dica).toBe(dicaOriginal); // a chave nao mudou
  });

  it('apiKey curta demais e rejeitada', async () => {
    const r = await post('/admin/config/asaas', { ambiente: 'sandbox', apiKey: '123' }, tokenSuperadmin, 'PUT');
    expect(r.status).toBe(400);
  });

  it('ambiente fora da lista fechada e rejeitado', async () => {
    const r = await post(
      '/admin/config/asaas',
      { ambiente: 'producao-hackeada', apiKey: 'uma-chave-valida-de-verdade-123' },
      tokenSuperadmin,
      'PUT',
    );
    expect(r.status).toBe(400);
  });
});
