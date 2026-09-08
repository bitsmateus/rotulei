/**
 * Cadastro publico (item 4) — cria tenant em trial, sem cartao, e ja loga.
 *
 * Inclui a regra "um trial por pessoa": CNPJ e e-mail sao unicos, mas
 * triviais de trocar (nova empresa MEI, novo Gmail); o CPF de quem se
 * cadastra e o identificador que realmente amarra "essa pessoa ja usou o
 * trial dela" — ver usuarios_cpf_uk / usuarios_telefone_uk.
 */
import { describe, expect, it } from 'vitest';
import { cnpjValido, cpfValido, telefoneValido } from './documentos-teste';

const BASE = `http://localhost:${process.env.ROTULEI_TEST_PORT ?? 3399}/api`;

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

function corpoValido(sufixo: number) {
  return {
    nomeMercado: `Mercado Teste Cadastro ${marca}-${sufixo}`,
    cnpj: cnpjValido(sufixo),
    nomeAdmin: 'Dono do Mercado',
    cpf: cpfValido(sufixo),
    telefone: telefoneValido(sufixo),
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

  it('rejeita CNPJ com formato certo mas digito verificador errado', async () => {
    // 14 digitos, passa no regex do DTO, mas nao existe de verdade.
    const r = await post('/public/cadastro', { ...corpoValido(60), cnpj: '11222333000199' });
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

describe('validacao de CPF', () => {
  it('rejeita CPF com formato certo mas digito verificador errado', async () => {
    const r = await post('/public/cadastro', { ...corpoValido(20), cpf: '11144477736' });
    expect(r.status).toBe(400);
  });

  it('rejeita CPF com todos os digitos iguais', async () => {
    const r = await post('/public/cadastro', { ...corpoValido(21), cpf: '11111111111' });
    expect(r.status).toBe(400);
  });

  it('rejeita CPF fora do formato (poucos digitos)', async () => {
    const r = await post('/public/cadastro', { ...corpoValido(22), cpf: '123' });
    expect(r.status).toBe(400);
  });

  it('aceita CPF com mascara', async () => {
    const dados = corpoValido(23);
    const c = dados.cpf;
    dados.cpf = `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;
    expect((await post('/public/cadastro', dados)).status).toBe(201);
  });

  it('aceita o CPF de teste classico 111.444.777-35', async () => {
    const r = await post('/public/cadastro', { ...corpoValido(24), cpf: '111.444.777-35' });
    expect(r.status).toBe(201);
  });
});

describe('validacao de telefone', () => {
  it('rejeita telefone com DDD invalido', async () => {
    const r = await post('/public/cadastro', { ...corpoValido(30), telefone: '00987654321' });
    expect(r.status).toBe(400);
  });

  it('rejeita celular sem o 9 na frente', async () => {
    const r = await post('/public/cadastro', { ...corpoValido(31), telefone: '11787654321' });
    expect(r.status).toBe(400);
  });

  it('aceita telefone fixo (10 digitos)', async () => {
    const r = await post('/public/cadastro', { ...corpoValido(32), telefone: '1132345678' });
    expect(r.status).toBe(201);
  });

  it('aceita telefone com mascara', async () => {
    const dados = corpoValido(33);
    dados.telefone = `(${dados.telefone.slice(0, 2)}) ${dados.telefone.slice(2, 7)}-${dados.telefone.slice(7)}`;
    expect((await post('/public/cadastro', dados)).status).toBe(201);
  });
});

describe('so um trial por pessoa (CPF e telefone unicos, independente de CNPJ/e-mail)', () => {
  it('mesmo CPF, CNPJ e e-mail diferentes -> rejeitado', async () => {
    const primeiro = corpoValido(40);
    expect((await post('/public/cadastro', primeiro)).status).toBe(201);

    // outra empresa, outro e-mail, MESMA pessoa (mesmo CPF)
    const segundo = { ...corpoValido(41), cpf: primeiro.cpf };
    const r = await post('/public/cadastro', segundo);
    expect(r.status).toBe(409);
    expect((await r.json()).message).toMatch(/cpf/i);
  });

  it('mesmo telefone, CNPJ/e-mail/CPF diferentes -> rejeitado', async () => {
    const primeiro = corpoValido(42);
    expect((await post('/public/cadastro', primeiro)).status).toBe(201);

    const segundo = { ...corpoValido(43), telefone: primeiro.telefone };
    const r = await post('/public/cadastro', segundo);
    expect(r.status).toBe(409);
    expect((await r.json()).message).toMatch(/telefone/i);
  });

  it('CPF e telefone diferentes -> segundo cadastro passa normalmente', async () => {
    expect((await post('/public/cadastro', corpoValido(44))).status).toBe(201);
    expect((await post('/public/cadastro', corpoValido(45))).status).toBe(201);
  });
});
