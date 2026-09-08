export interface CredenciaisAsaas {
  apiKey: string;
  webhookToken?: string;
  ambiente: 'sandbox' | 'production';
}

export type StatusCobrancaAsaas = 'PENDENTE' | 'PAGA' | 'VENCIDA' | 'CANCELADA' | 'ESTORNADA';

export interface ResultadoCheckout {
  assinaturaGatewayId: string;
  primeiroPagamentoId: string;
  /** Link hospedado do Asaas — o Rotulei nunca ve numero de cartao. */
  checkoutUrl: string;
}

export interface StatusPagamentoAsaas {
  externalId: string;
  status: StatusCobrancaAsaas;
  assinaturaGatewayId: string | null;
  pagoEm: Date | null;
  /** null enquanto o pagador nao escolheu a forma (billingType UNDEFINED). */
  metodo: 'pix' | 'boleto' | 'cartao' | null;
  valorCentavos: number;
}
