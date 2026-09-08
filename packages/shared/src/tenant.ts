/**
 * Status do tenant.
 *
 * Regra do escopo: nunca e setado por uma pessoa comum — so pelo cadastro
 * publico, pelo job de fim de trial, pelos webhooks do gateway, ou por
 * superadmin (acao manual explicita). O banco reforca isso por trigger.
 *
 *   trial        -> acesso liberado, ainda dentro dos DIAS_DE_TRIAL.
 *   ativo        -> pagamento confirmado, assinatura recorrente em dia.
 *   inadimplente -> SEM acesso. Cobrindo dois casos: trial venceu sem cartao
 *                   cadastrado, OU uma cobranca recorrente foi recusada. Nos
 *                   dois, o app pede o cartao para voltar a 'ativo' (Opcao B —
 *                   ver DECISOES.md #18). Diferente de 'suspenso': aqui e o
 *                   proprio sistema reagindo a falta de pagamento, nao uma
 *                   decisao humana.
 *   suspenso     -> SEM acesso, por acao MANUAL do superadmin (ex.: suporte,
 *                   fraude, pedido do cliente). So volta por acao humana.
 *   cancelado    -> encerrado, dados retidos por prazo antes de purge.
 */
export const STATUS_TENANT = [
  'trial',
  'ativo',
  'inadimplente',
  'suspenso',
  'cancelado',
] as const;
export type StatusTenant = (typeof STATUS_TENANT)[number];

/**
 * Status que permitem uso do produto.
 *
 * 'inadimplente' NAO esta aqui: e precisamente o estado de "bloqueado ate
 * pagar" (Opcao B). Se um dia existir carencia (alguns dias de acesso apos o
 * trial vencer antes de bloquear de verdade), ela e outro status, nao uma
 * excecao aqui.
 */
export const STATUS_COM_ACESSO: readonly StatusTenant[] = ['trial', 'ativo'];

export const DIAS_DE_TRIAL = 7;

export interface Tenant {
  id: string;
  nome: string;
  cnpj: string;
  slug: string;
  status: StatusTenant;
  planoId: string;
  trialTerminaEm: Date | null;
  criadoEm: Date;
  atualizadoEm: Date;
}
