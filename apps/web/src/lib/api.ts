/**
 * Cliente HTTP do Rotulei.
 *
 * Onde cada token fica, e por quê:
 *
 *   accessToken  -> só em memória (variável de módulo). Some ao recarregar a
 *                   página, o que é justamente o ponto: não fica em disco.
 *   refreshToken -> localStorage, porque precisa sobreviver ao reload.
 *
 * O refresh em localStorage é alcançável por XSS. A alternativa mais forte é
 * cookie httpOnly + SameSite, mas isso exige proteção contra CSRF na API — está
 * anotado em DECISOES.md como decisão a revisitar antes de abrir para cliente.
 * O access token curto (15 min) limita a janela enquanto isso.
 */

const BASE = '/api';
const CHAVE_REFRESH = 'rotulei:refresh';

let accessToken: string | null = null;

/** Renovação em andamento — evita N chamadas de refresh quando N requests dão 401 juntos. */
let renovacaoEmAndamento: Promise<boolean> | null = null;

export class ErroDaApi extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

export const temSessao = () => Boolean(lerRefresh());

function lerRefresh(): string | null {
  try {
    return localStorage.getItem(CHAVE_REFRESH);
  } catch {
    return null;
  }
}

function guardarSessao(tokens: { accessToken: string; refreshToken: string }) {
  accessToken = tokens.accessToken;
  try {
    localStorage.setItem(CHAVE_REFRESH, tokens.refreshToken);
  } catch {
    // Modo privado: a sessão vale só enquanto a aba estiver aberta.
  }
}

function limparSessao() {
  accessToken = null;
  try {
    localStorage.removeItem(CHAVE_REFRESH);
  } catch {
    // nada a fazer
  }
}

async function bruto(caminho: string, opcoes: RequestInit = {}): Promise<Response> {
  return fetch(`${BASE}${caminho}`, {
    ...opcoes,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(opcoes.headers ?? {}),
    },
  });
}

async function renovar(): Promise<boolean> {
  const refreshToken = lerRefresh();
  if (!refreshToken) return false;

  const r = await fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!r.ok) {
    // Refresh recusado significa sessão morta — inclusive no caso em que a API
    // derrubou tudo por detectar reuso do token. Não adianta insistir.
    limparSessao();
    return false;
  }

  guardarSessao(await r.json());
  return true;
}

/**
 * Faz a chamada; se voltar 401, tenta renovar UMA vez e repete.
 *
 * Requests simultâneos compartilham a mesma renovação: sem isso, cinco chamadas
 * expirando juntas disparariam cinco refresh em paralelo — e, com rotação, os
 * quatro perdedores apresentariam um token já rotacionado, o que a API
 * interpreta como vazamento e derruba a sessão inteira.
 */
export async function api<T>(caminho: string, opcoes: RequestInit = {}): Promise<T> {
  let resposta = await bruto(caminho, opcoes);

  if (resposta.status === 401 && lerRefresh()) {
    renovacaoEmAndamento ??= renovar().finally(() => {
      renovacaoEmAndamento = null;
    });

    if (await renovacaoEmAndamento) {
      resposta = await bruto(caminho, opcoes);
    }
  }

  if (resposta.status === 204) return undefined as T;

  const corpo = await resposta.json().catch(() => null);

  if (!resposta.ok) {
    const mensagem =
      (Array.isArray(corpo?.message) ? corpo.message[0] : corpo?.message) ??
      'Não foi possível completar a operação.';
    throw new ErroDaApi(resposta.status, mensagem);
  }

  return corpo as T;
}

// ── auth ─────────────────────────────────────────────────────────────────────

export interface UsuarioDaSessao {
  id: string;
  tenantId: string | null;
  lojaId: string | null;
  papel: 'superadmin' | 'admin' | 'operador';
}

export async function entrar(email: string, senha: string): Promise<UsuarioDaSessao> {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, senha }),
  });

  const corpo = await r.json().catch(() => null);
  if (!r.ok) {
    throw new ErroDaApi(r.status, corpo?.message ?? 'E-mail ou senha inválidos.');
  }

  guardarSessao(corpo);
  return api<UsuarioDaSessao>('/auth/eu');
}

export async function sair(): Promise<void> {
  const refreshToken = lerRefresh();
  limparSessao();
  if (!refreshToken) return;

  await fetch(`${BASE}/auth/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  }).catch(() => {
    // A sessão local já foi limpa; falhar aqui não deve travar o logout.
  });
}

/** Reidrata a sessão ao abrir a página: só há refresh token, o access morreu. */
export async function recuperarSessao(): Promise<UsuarioDaSessao | null> {
  if (!lerRefresh()) return null;
  if (!(await renovar())) return null;
  return api<UsuarioDaSessao>('/auth/eu').catch(() => null);
}
