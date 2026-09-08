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

function renovarUmaVez(): Promise<boolean> {
  renovacaoEmAndamento ??= renovar().finally(() => {
    renovacaoEmAndamento = null;
  });
  return renovacaoEmAndamento;
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
    if (await renovarUmaVez()) {
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
  bloqueado: boolean;
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

export interface DadosCadastro {
  nomeMercado: string;
  cnpj: string;
  nomeAdmin: string;
  cpf: string;
  telefone: string;
  email: string;
  senha: string;
  planoCodigo: string;
}

export async function cadastrar(dados: DadosCadastro): Promise<UsuarioDaSessao> {
  const r = await fetch(`${BASE}/public/cadastro`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });

  const corpo = await r.json().catch(() => null);
  if (!r.ok) {
    throw new ErroDaApi(r.status, corpo?.message ?? 'Não foi possível concluir o cadastro.');
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
  if (!(await renovarUmaVez())) return null;
  return api<UsuarioDaSessao>('/auth/eu').catch(() => null);
}

// ── planos e cobrança ────────────────────────────────────────────────────────

export interface Plano {
  id: string;
  codigo: string;
  nome: string;
  precoMensalCentavos: number;
  precoAnualCentavos: number | null;
  precoPorLoja: boolean;
  limiteLojas: number | null;
  ativo: boolean;
}

/** Catálogo público — alimenta o select de plano na tela de cadastro. */
export async function listarPlanos(): Promise<Plano[]> {
  const r = await fetch(`${BASE}/planos`);
  if (!r.ok) throw new ErroDaApi(r.status, 'Não foi possível carregar os planos.');
  return r.json();
}

export interface StatusAssinatura {
  statusTenant: string;
  assinatura: { status: string } | null;
  ultimoPagamento: { status: string; metodo: string | null } | null;
}

/** Só o admin acessa (ver AssinaturaController) — operador não lida com cobrança. */
export async function obterStatusAssinatura(): Promise<StatusAssinatura> {
  return api<StatusAssinatura>('/tenant/assinatura');
}

/**
 * Abre a cobrança no Asaas e devolve o link de checkout hospedado — o Rotulei
 * nunca vê número de cartão (DECISOES.md #19). Quem chama deve redirecionar
 * a própria aba para `checkoutUrl`.
 */
export async function iniciarCheckout(): Promise<{ checkoutUrl: string }> {
  return api<{ checkoutUrl: string }>('/tenant/assinatura/checkout', { method: 'POST' });
}

// ── painel superadmin (item 6) ───────────────────────────────────────────────

export interface TenantSuperadmin {
  id: string;
  nome: string;
  cnpj: string;
  slug: string;
  status: string;
  plano: { id: string; codigo: string; nome: string };
  qtdLojas: number;
  mrrCentavos: number;
  proximaCobrancaEm: string | null;
  proximaCobrancaEstimada: boolean;
  trialTerminaEm: string | null;
  criadoEm: string;
}

export interface MetricasPlataforma {
  mrrTotalCentavos: number;
  tenantsAtivos: number;
  tenantsEmTrial: number;
  tenantsInadimplentes: number;
  tenantsSuspensos: number;
  tenantsCancelados: number;
}

export async function listarTenants(): Promise<TenantSuperadmin[]> {
  return api<TenantSuperadmin[]>('/admin/tenants');
}

export async function obterMetricas(): Promise<MetricasPlataforma> {
  return api<MetricasPlataforma>('/admin/metricas');
}

export async function alterarStatusTenant(
  tenantId: string,
  status: string,
): Promise<TenantSuperadmin> {
  return api<TenantSuperadmin>(`/admin/tenants/${tenantId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

/** Todos os planos, inclusive inativos — diferente de listarPlanos() (catálogo público). */
export async function listarPlanosAdmin(): Promise<Plano[]> {
  return api<Plano[]>('/admin/planos');
}

export interface EdicaoDePlano {
  nome?: string;
  precoMensalCentavos?: number;
  precoAnualCentavos?: number | null;
  precoPorLoja?: boolean;
  limiteLojas?: number | null;
  ativo?: boolean;
}

export async function editarPlano(planoId: string, dados: EdicaoDePlano): Promise<Plano> {
  return api<Plano>(`/admin/planos/${planoId}`, {
    method: 'PATCH',
    body: JSON.stringify(dados),
  });
}
