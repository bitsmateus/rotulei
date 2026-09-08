import { timingSafeEqual } from 'node:crypto';
import type {
  CredenciaisAsaas,
  ResultadoCheckout,
  StatusCobrancaAsaas,
  StatusPagamentoAsaas,
} from './asaas.tipos.js';

/**
 * Cliente HTTP do Asaas para a cobranca DA PLATAFORMA — o Rotulei fatura os
 * proprios tenants. Nao confundir com cobranca que um tenant faria dos
 * clientes dele (fora de escopo deste produto).
 *
 * Decisao de desenho: o Rotulei nunca recebe numero de cartao. A assinatura e
 * criada sem forma de pagamento definida (`billingType: UNDEFINED`); o Asaas
 * devolve um link hospedado (`invoiceUrl`) onde o proprio tenant escolhe
 * Pix/boleto/cartao numa pagina do Asaas. Isso mantem o Rotulei fora do
 * escopo de PCI-DSS que tocar em PAN de cartao exigiria.
 */
export class AsaasCliente {
  private readonly baseUrl: string;

  constructor(private readonly creds: CredenciaisAsaas) {
    this.baseUrl =
      creds.ambiente === 'production'
        ? 'https://api.asaas.com/v3'
        : 'https://sandbox.asaas.com/api/v3';
  }

  private async chamar<T>(
    caminho: string,
    opcoes: { method?: string; body?: unknown } = {},
  ): Promise<T> {
    const resp = await fetch(`${this.baseUrl}${caminho}`, {
      method: opcoes.method ?? 'GET',
      headers: {
        access_token: this.creds.apiKey,
        'Content-Type': 'application/json',
      },
      body: opcoes.body ? JSON.stringify(opcoes.body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });

    const corpo = (await resp.json().catch(() => null)) as {
      errors?: { description?: string }[];
    } | null;
    if (!resp.ok) {
      const msg = corpo?.errors?.[0]?.description ?? `HTTP ${resp.status}`;
      throw new Error(`Asaas: ${msg}`);
    }
    return corpo as T;
  }

  async testarConexao(): Promise<boolean> {
    // GET leve e autenticado: token invalido devolve 401.
    await this.chamar('/customers?limit=1');
    return true;
  }

  /** Acha o cliente pelo CNPJ ou cria um novo. Idempotente. */
  async garantirCliente(input: { nome: string; cnpj: string }): Promise<string> {
    const cnpjLimpo = input.cnpj.replace(/\D/g, '');
    const busca = await this.chamar<{ data: { id: string }[] }>(
      `/customers?cpfCnpj=${cnpjLimpo}`,
    );
    if (busca.data?.length) return busca.data[0].id;

    const criado = await this.chamar<{ id: string }>('/customers', {
      method: 'POST',
      body: { name: input.nome, cpfCnpj: cnpjLimpo },
    });
    return criado.id;
  }

  /**
   * Cria a assinatura recorrente e devolve o link de checkout hospedado do
   * primeiro pagamento. `nextDueDate` e hoje: o Asaas cobra o primeiro ciclo
   * imediatamente ao checkout ser concluido.
   */
  async criarAssinaturaComCheckout(input: {
    customerId: string;
    valorCentavos: number;
    ciclo: 'mensal' | 'anual';
    descricao: string;
    externalRef: string;
  }): Promise<ResultadoCheckout> {
    const assinatura = await this.chamar<{ id: string }>('/subscriptions', {
      method: 'POST',
      body: {
        customer: input.customerId,
        // UNDEFINED = o Asaas deixa o pagador escolher a forma na pagina dele.
        billingType: 'UNDEFINED',
        cycle: input.ciclo === 'anual' ? 'YEARLY' : 'MONTHLY',
        value: input.valorCentavos / 100,
        nextDueDate: new Date().toISOString().slice(0, 10),
        description: input.descricao,
        externalReference: input.externalRef,
      },
    });

    // O primeiro pagamento e criado de forma assincrona pelo Asaas; buscamos
    // logo em seguida para pegar o link de checkout dele.
    const pagamentos = await this.chamar<{ data: { id: string; invoiceUrl: string }[] }>(
      `/payments?subscription=${assinatura.id}&limit=1`,
    );
    const primeiro = pagamentos.data?.[0];
    if (!primeiro) {
      throw new Error('Asaas nao gerou a primeira cobranca da assinatura a tempo.');
    }

    return {
      assinaturaGatewayId: assinatura.id,
      primeiroPagamentoId: primeiro.id,
      checkoutUrl: primeiro.invoiceUrl,
    };
  }

  /**
   * Situacao real de uma cobranca. Fonte autoritativa — o corpo de um webhook
   * NUNCA e suficiente sozinho, sempre reconfirmamos aqui.
   */
  async consultarPagamento(externalId: string): Promise<StatusPagamentoAsaas> {
    const p = await this.chamar<{
      id: string;
      status: string;
      deleted?: boolean;
      paymentDate?: string;
      subscription?: string;
      billingType?: string;
      value?: number;
    }>(`/payments/${externalId}`);

    return {
      externalId: p.id,
      // Cobranca excluida no Asaas volta com deleted=true, mesmo que o status
      // ainda diga PENDING — sem isto a reconciliacao a veria como pendente.
      status: p.deleted ? 'CANCELADA' : this.normalizarStatus(p.status),
      assinaturaGatewayId: p.subscription ?? null,
      pagoEm: p.paymentDate ? new Date(p.paymentDate) : null,
      metodo: this.normalizarMetodo(p.billingType),
      // O Asaas devolve reais em float; Math.round evita sobra de ponto
      // flutuante (ex.: 69.9 * 100 pode dar 6989.999999999999).
      valorCentavos: Math.round((p.value ?? 0) * 100),
    };
  }

  private normalizarMetodo(billingType?: string): 'pix' | 'boleto' | 'cartao' | null {
    switch (billingType) {
      case 'PIX':
        return 'pix';
      case 'BOLETO':
        return 'boleto';
      case 'CREDIT_CARD':
        return 'cartao';
      default:
        // UNDEFINED: o pagador ainda nao escolheu a forma na pagina do Asaas.
        return null;
    }
  }

  private normalizarStatus(status: string): StatusCobrancaAsaas {
    const mapa: Record<string, StatusCobrancaAsaas> = {
      PENDING: 'PENDENTE',
      RECEIVED: 'PAGA',
      CONFIRMED: 'PAGA',
      RECEIVED_IN_CASH: 'PAGA',
      OVERDUE: 'VENCIDA',
      REFUNDED: 'ESTORNADA',
      DELETED: 'CANCELADA',
    };
    return mapa[status] ?? 'PENDENTE';
  }

  /**
   * So confere o token do webhook para fins de LOG. Nunca decide sozinho: a
   * confirmacao de verdade e sempre a consulta a API (consultarPagamento).
   * Assim, um webhookToken mal configurado no painel do Asaas nao faz o
   * Rotulei ignorar pagamentos legitimos — so avisa no log.
   */
  tokenDoWebhookConfere(headers: Record<string, string | string[] | undefined>): boolean {
    if (!this.creds.webhookToken) return false;
    const recebido = headers['asaas-access-token'];
    const valor = Array.isArray(recebido) ? recebido[0] : recebido;
    if (!valor) return false;

    const a = Buffer.from(valor);
    const b = Buffer.from(this.creds.webhookToken);
    // timingSafeEqual exige buffers do mesmo tamanho — comprimento diferente
    // ja e "nao confere", sem precisar de comparacao byte a byte.
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
