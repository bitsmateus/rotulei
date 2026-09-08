/**
 * Painel do tenant (item 7, ESCOPO.md) — lojas, usuarios, marca propria.
 *
 * So o admin do tenant mexe (operador fica de fora, RLS + @Papeis('admin')).
 * Marca propria e recurso do plano Rede/Enterprise (seed.ts: `marca_propria`
 * em `recursos`) — Mercado Nunes (rede) tem acesso, Mercado Vizinho (inicio)
 * nao.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { cnpjValido, cpfValido, telefoneValido } from './documentos-teste';

const BASE = `http://localhost:${process.env.ROTULEI_TEST_PORT ?? 3399}/api`;

async function chamar(method: string, caminho: string, corpo?: unknown, token?: string) {
  return fetch(`${BASE}${caminho}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
  });
}
const get = (caminho: string, token?: string) => chamar('GET', caminho, undefined, token);
const post = (caminho: string, corpo: unknown, token?: string) => chamar('POST', caminho, corpo, token);
const patch = (caminho: string, corpo: unknown, token?: string) => chamar('PATCH', caminho, corpo, token);
const put = (caminho: string, corpo: unknown, token?: string) => chamar('PUT', caminho, corpo, token);
const del = (caminho: string, token?: string) => chamar('DELETE', caminho, undefined, token);

async function entrar(email: string) {
  const r = await post('/auth/login', { email, senha: 'rotulei-dev-2026' });
  return (await r.json()).accessToken as string;
}

let tokenAdminNunes: string;
let tokenOperadorNunes: string;
let tokenAdminVizinho: string;
let adminNunesId: string;
let lojaCentralId: string;
let lojaVilaMoemaId: string;
let lojaDoVizinhoId: string;

beforeAll(async () => {
  tokenAdminNunes = await entrar('admin@mercadonunes.com.br');
  tokenOperadorNunes = await entrar('operador@mercadonunes.com.br');
  tokenAdminVizinho = await entrar('admin@mercadovizinho.com.br');

  adminNunesId = (await (await get('/auth/eu', tokenAdminNunes)).json()).id;

  const lojasNunes = await (await get('/tenant/lojas', tokenAdminNunes)).json();
  lojaCentralId = lojasNunes.find((l: { nome: string }) => l.nome === 'Central').id;
  lojaVilaMoemaId = lojasNunes.find((l: { nome: string }) => l.nome === 'Vila Moema').id;

  const lojasVizinho = await (await get('/tenant/lojas', tokenAdminVizinho)).json();
  lojaDoVizinhoId = lojasVizinho[0].id;
});

describe('acesso restrito ao admin do tenant', () => {
  it('operador nao le nem escreve lojas (403)', async () => {
    expect((await get('/tenant/lojas', tokenOperadorNunes)).status).toBe(403);
    expect((await post('/tenant/lojas', { nome: 'X' }, tokenOperadorNunes)).status).toBe(403);
  });

  it('operador nao le nem escreve usuarios (403)', async () => {
    expect((await get('/tenant/usuarios', tokenOperadorNunes)).status).toBe(403);
    expect((await post('/tenant/usuarios', { nome: 'X' }, tokenOperadorNunes)).status).toBe(403);
  });

  it('operador LE a marca mas nao escreve (200 / 403)', async () => {
    expect((await get('/tenant/marca', tokenOperadorNunes)).status).toBe(200);
    expect((await put('/tenant/marca', { corPrimaria: '#111111' }, tokenOperadorNunes)).status).toBe(403);
  });

  it('sem token, 401 em todas as rotas', async () => {
    expect((await get('/tenant/lojas')).status).toBe(401);
    expect((await get('/tenant/usuarios')).status).toBe(401);
    expect((await get('/tenant/marca')).status).toBe(401);
  });
});

describe('lojas', () => {
  it('lista as lojas do seed', async () => {
    const lojas = await (await get('/tenant/lojas', tokenAdminNunes)).json();
    expect(lojas.map((l: { nome: string }) => l.nome).sort()).toEqual(['Central', 'Vila Moema']);
  });

  it('cria, edita e remove uma loja', async () => {
    const criada = await post('/tenant/lojas', { nome: 'Loja Teste Item7', endereco: 'Rua X' }, tokenAdminNunes);
    expect(criada.status).toBe(201);
    const loja = await criada.json();
    expect(loja.nome).toBe('Loja Teste Item7');

    const editada = await patch(`/tenant/lojas/${loja.id}`, { endereco: 'Rua Y' }, tokenAdminNunes);
    expect(editada.status).toBe(200);
    expect((await editada.json()).endereco).toBe('Rua Y');

    expect((await del(`/tenant/lojas/${loja.id}`, tokenAdminNunes)).status).toBe(204);
    const lojas = await (await get('/tenant/lojas', tokenAdminNunes)).json();
    expect(lojas.find((l: { id: string }) => l.id === loja.id)).toBeUndefined();
  });

  it('nome duplicado no mesmo tenant e 409', async () => {
    const r = await post('/tenant/lojas', { nome: 'Central' }, tokenAdminNunes);
    expect(r.status).toBe(409);
  });

  it('editar/remover loja inexistente e 404', async () => {
    const id = '00000000-0000-0000-0000-000000000000';
    expect((await patch(`/tenant/lojas/${id}`, { nome: 'X' }, tokenAdminNunes)).status).toBe(404);
    expect((await del(`/tenant/lojas/${id}`, tokenAdminNunes)).status).toBe(404);
  });

  it('respeita o limite de lojas do plano', async () => {
    const sufixo = Date.now() % 1_000_000;
    const cadastro = await post('/public/cadastro', {
      nomeMercado: `Mercado Limite Loja ${sufixo}`,
      cnpj: cnpjValido(sufixo),
      nomeAdmin: 'Dono Teste',
      cpf: cpfValido(sufixo),
      telefone: telefoneValido(sufixo),
      email: `dono.limite.${sufixo}@teste.com`,
      senha: 'senha-bem-forte-123',
      planoCodigo: 'inicio', // limite_lojas = 1, e nasce sem nenhuma loja
    });
    expect(cadastro.status).toBe(201);
    const tokenNovoAdmin = (await cadastro.json()).accessToken as string;

    const primeira = await post('/tenant/lojas', { nome: 'Unica Loja' }, tokenNovoAdmin);
    expect(primeira.status).toBe(201);

    const segunda = await post('/tenant/lojas', { nome: 'Loja Demais' }, tokenNovoAdmin);
    expect(segunda.status).toBe(400);
  });
});

describe('usuarios', () => {
  let operadorCriadoId: string;

  it('lista os usuarios do seed', async () => {
    const usuarios = await (await get('/tenant/usuarios', tokenAdminNunes)).json();
    expect(usuarios.map((u: { email: string }) => u.email)).toEqual(
      expect.arrayContaining(['admin@mercadonunes.com.br', 'operador@mercadonunes.com.br']),
    );
  });

  it('cria um operador vinculado a uma loja', async () => {
    const r = await post(
      '/tenant/usuarios',
      {
        nome: 'Operador Teste Item7',
        email: `operador.item7.${Date.now()}@teste.com`,
        senha: 'senha-bem-forte-123',
        papel: 'operador',
        lojaId: lojaCentralId,
      },
      tokenAdminNunes,
    );
    expect(r.status).toBe(201);
    const usuario = await r.json();
    expect(usuario.papel).toBe('operador');
    expect(usuario.lojaId).toBe(lojaCentralId);
    operadorCriadoId = usuario.id;
  });

  it('admin nao carrega lojaId mesmo se informado no corpo', async () => {
    const r = await post(
      '/tenant/usuarios',
      {
        nome: 'Admin Extra Item7',
        email: `admin.item7.${Date.now()}@teste.com`,
        senha: 'senha-bem-forte-123',
        papel: 'admin',
        lojaId: lojaCentralId,
      },
      tokenAdminNunes,
    );
    expect(r.status).toBe(201);
    expect((await r.json()).lojaId).toBeNull();
  });

  it('email duplicado e 409', async () => {
    const r = await post(
      '/tenant/usuarios',
      {
        nome: 'Duplicado',
        email: 'operador@mercadonunes.com.br',
        senha: 'senha-bem-forte-123',
        papel: 'operador',
      },
      tokenAdminNunes,
    );
    expect(r.status).toBe(409);
  });

  it('papel invalido (ex.: superadmin) e rejeitado', async () => {
    const r = await post(
      '/tenant/usuarios',
      {
        nome: 'Tentativa Superadmin',
        email: `tentativa.${Date.now()}@teste.com`,
        senha: 'senha-bem-forte-123',
        papel: 'superadmin',
      },
      tokenAdminNunes,
    );
    expect(r.status).toBe(400);
  });

  it('loja de outro tenant e rejeitada', async () => {
    const r = await post(
      '/tenant/usuarios',
      {
        nome: 'Operador Loja Errada',
        email: `loja.errada.${Date.now()}@teste.com`,
        senha: 'senha-bem-forte-123',
        papel: 'operador',
        lojaId: lojaDoVizinhoId,
      },
      tokenAdminNunes,
    );
    expect(r.status).toBe(400);
  });

  it('edita papel, loja e status ativo de outro usuario', async () => {
    const editado = await patch(
      `/tenant/usuarios/${operadorCriadoId}`,
      { lojaId: lojaVilaMoemaId },
      tokenAdminNunes,
    );
    expect(editado.status).toBe(200);
    expect((await editado.json()).lojaId).toBe(lojaVilaMoemaId);

    const desativado = await patch(`/tenant/usuarios/${operadorCriadoId}`, { ativo: false }, tokenAdminNunes);
    expect(desativado.status).toBe(200);
    expect((await desativado.json()).ativo).toBe(false);

    const reativado = await patch(`/tenant/usuarios/${operadorCriadoId}`, { ativo: true }, tokenAdminNunes);
    expect(reativado.status).toBe(200);
    expect((await reativado.json()).ativo).toBe(true);
  });

  it('usuario inexistente e 404', async () => {
    const id = '00000000-0000-0000-0000-000000000000';
    expect((await patch(`/tenant/usuarios/${id}`, { nome: 'Fulano' }, tokenAdminNunes)).status).toBe(404);
    expect((await del(`/tenant/usuarios/${id}`, tokenAdminNunes)).status).toBe(404);
  });

  it('admin nao mexe na propria conta (auto-lockout)', async () => {
    expect((await patch(`/tenant/usuarios/${adminNunesId}`, { papel: 'operador' }, tokenAdminNunes)).status).toBe(400);
    expect((await patch(`/tenant/usuarios/${adminNunesId}`, { ativo: false }, tokenAdminNunes)).status).toBe(400);
    expect((await del(`/tenant/usuarios/${adminNunesId}`, tokenAdminNunes)).status).toBe(400);
  });

  it('remove o operador criado no teste (limpeza)', async () => {
    expect((await del(`/tenant/usuarios/${operadorCriadoId}`, tokenAdminNunes)).status).toBe(204);
  });
});

describe('marca propria', () => {
  const LOGO_DE_TESTE = 'data:image/png;base64,aGVsbG8=';

  it('Nunes (plano rede) configura logo e cores', async () => {
    const r = await put(
      '/tenant/marca',
      { logoDataUrl: LOGO_DE_TESTE, corPrimaria: '#F6902F', corSecundaria: '#1C1C1C' },
      tokenAdminNunes,
    );
    expect(r.status).toBe(200);
    const marca = await r.json();
    expect(marca.logoDataUrl).toBe(LOGO_DE_TESTE);
    expect(marca.corPrimaria).toBe('#F6902F');
    expect(marca.marcaPropriaDisponivel).toBe(true);

    const lido = await (await get('/tenant/marca', tokenAdminNunes)).json();
    expect(lido.logoDataUrl).toBe(LOGO_DE_TESTE);
  });

  it('editar so um campo nao apaga os demais', async () => {
    const r = await put('/tenant/marca', { corSecundaria: '#222222' }, tokenAdminNunes);
    expect(r.status).toBe(200);
    const marca = await r.json();
    expect(marca.corSecundaria).toBe('#222222');
    expect(marca.logoDataUrl).toBe(LOGO_DE_TESTE); // nao foi mexido

    // limpa para nao deixar rastro em outros testes
    await put('/tenant/marca', { logoDataUrl: null, corPrimaria: null, corSecundaria: null }, tokenAdminNunes);
  });

  it('logo em formato invalido e 400', async () => {
    const r = await put('/tenant/marca', { logoDataUrl: 'nao-e-uma-data-url' }, tokenAdminNunes);
    expect(r.status).toBe(400);
  });

  it('cor em formato invalido e 400', async () => {
    const r = await put('/tenant/marca', { corPrimaria: 'laranja' }, tokenAdminNunes);
    expect(r.status).toBe(400);
  });

  it('Vizinho (plano inicio) nao tem marca propria disponivel', async () => {
    const marca = await (await get('/tenant/marca', tokenAdminVizinho)).json();
    expect(marca.marcaPropriaDisponivel).toBe(false);
  });

  it('Vizinho nao pode salvar marca mesmo sendo admin do proprio tenant', async () => {
    const r = await put('/tenant/marca', { corPrimaria: '#000000' }, tokenAdminVizinho);
    expect(r.status).toBe(400);
  });
});
