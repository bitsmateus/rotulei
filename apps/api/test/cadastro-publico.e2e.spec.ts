/**
 * Cadastro publico (item 4) — cria tenant em trial, sem cartao, e ja loga.
 */
import { describe, expect, it } from 'vitest';

const BASE = 'http://localhost:3399/api';

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
  return fetch(`${BASE}${caminho}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
}

const marca = Date.now().toString(36);
const cnpjValido = (sufixo: number) => (Date.now().toString() + String(sufixo)).slice(-14).padStart(14, '7');

function corpoValido(sufixo: number) {
  return {
    nomeMercado: `Mercado Teste Cadastro ${marca}-${sufixo}`,
    cnpj: cnpjValido(sufixo),
    nomeAdmin: 'Dono do Mercado',
    email: `dono.${marca}.${sufixo}@teste.com`,
    senha: 'senha-bem-forte-123',
    planoCodigo: 'inicio',
  };
}

describe('cadastro publico', () => {
  it('cria o tenant em trial, sem cartao, e ja devolve tokens (auto-login)', async () => {
    const r = await post('/public/cadastro', corpoValido(1));
    expect(r.status).toBe(201);

    const corpo = await r.json();
    expect(corpo.tenantId).toMatch(/^[0-9a-f-]{36}$/);
    expect(corpo.accessToken.split('.')).toHaveLength(3);
    expect(corpo.refreshToken.length).toBeGreaterThan(30);

    const eu = await (await get('/auth/eu', corpo.accessToken)).json();
    expect(eu.papel).toBe('admin');
    expect(eu.bloqueado).toBe(false); // trial ainda vale, sem cartao

    const cartazes = await get('/tenant/cartazes', corpo.accessToken);
    expect(cartazes.status).toBe(200); // trial tem acesso pleno
  });

  it('rejeita CNPJ duplicado', async () => {
    const dados = corpoValido(2);
    expect((await post('/public/cadastro', dados)).status).toBe(201);

    const dadosComMesmoCnpj = { ...corpoValido(3), cnpj: dados.cnpj };
    const r = await post('/public/cadastro', dadosComMesmoCnpj);
    expect(r.status).toBe(409);
  });

  it('rejeita e-mail duplicado', async () => {
    const dados = corpoValido(4);
    expect((await post('/public/cadastro', dados)).status).toBe(201);

    const dadosComMesmoEmail = { ...corpoValido(5), email: dados.email };
    const r = await post('/public/cadastro', dadosComMesmoEmail);
    expect(r.status).toBe(409);
  });

  it('rejeita CNPJ com formato invalido', async () => {
    const r = await post('/public/cadastro', { ...corpoValido(6), cnpj: '123' });
    expect(r.status).toBe(400);
  });

  it('rejeita senha curta', async () => {
    const r = await post('/public/cadastro', { ...corpoValido(7), senha: '123' });
    expect(r.status).toBe(400);
  });

  it('rejeita plano inexistente', async () => {
    const r = await post('/public/cadastro', { ...corpoValido(8), planoCodigo: 'nao-existe' });
    expect(r.status).toBe(404);
  });

  it('normaliza e-mail para minusculas', async () => {
    const dados = corpoValido(9);
    dados.email = dados.email.toUpperCase();
    const r = await post('/public/cadastro', dados);
    expect(r.status).toBe(201);

    const login = await post('/auth/login', { email: dados.email.toLowerCase(), senha: dados.senha });
    expect(login.status).toBe(200);
  });

  it('aceita CNPJ com mascara', async () => {
    const dados = corpoValido(10);
    const digitos = dados.cnpj;
    dados.cnpj = `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5, 8)}/${digitos.slice(8, 12)}-${digitos.slice(12)}`;
    const r = await post('/public/cadastro', dados);
    expect(r.status).toBe(201);
  });

  it('campos extras no corpo nao viram privilegio (ex.: tentar nascer superadmin)', async () => {
    const r = await post('/public/cadastro', {
      ...corpoValido(11),
      papel: 'superadmin',
      tenantId: '00000000-0000-0000-0000-000000000000',
    });
    expect(r.status).toBe(201);
    const corpo = await r.json();
    const eu = await (await get('/auth/eu', corpo.accessToken)).json();
    expect(eu.papel).toBe('admin');
  });
});
