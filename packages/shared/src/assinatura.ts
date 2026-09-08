export const STATUS_ASSINATURA = ['pendente', 'ativa', 'inadimplente', 'cancelada'] as const;
export type StatusAssinatura = (typeof STATUS_ASSINATURA)[number];

export interface Assinatura {
  id: string;
  tenantId: string;
  planoId: string;
  gatewaySubscriptionId: string | null;
  status: StatusAssinatura;
  ciclo: 'mensal' | 'anual';
  proximaCobrancaEm: Date | null;
  criadoEm: Date;
  atualizadoEm: Date;
}

export const METODOS_PAGAMENTO = ['pix', 'boleto', 'cartao'] as const;
export type MetodoPagamento = (typeof METODOS_PAGAMENTO)[number];

export const STATUS_PAGAMENTO = [
  'pendente',
  'confirmado',
  'recusado',
  'estornado',
  'cancelado',
] as const;
export type StatusPagamento = (typeof STATUS_PAGAMENTO)[number];

export interface Pagamento {
  id: string;
  tenantId: string;
  assinaturaId: string | null;
  valorCentavos: number;
  /** null ate o pagador escolher a forma na pagina hospedada do gateway. */
  metodo: MetodoPagamento | null;
  status: StatusPagamento;
  gatewayPaymentId: string | null;
  pagoEm: Date | null;
  criadoEm: Date;
}
