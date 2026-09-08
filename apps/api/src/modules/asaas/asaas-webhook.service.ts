import { Injectable, Logger } from '@nestjs/common';
import { ContextoDbService } from '../../database/contexto-db.service.js';
import { ConfigPlataformaService } from '../config-plataforma/config-plataforma.service.js';

/**
 * Webhook do Asaas da PLATAFORMA (Rotulei cobrando os tenants).
 *
 * Regra inegociavel: o status de um pagamento NUNCA vem do corpo do webhook.
 * O corpo so diz "algo aconteceu com o pagamento X" — quem informa O QUE
 * aconteceu e sempre uma nova consulta a API do Asaas, que e a fonte
 * autoritativa. Um corpo de webhook pode ser forjado; a resposta da API,
 * autenticada com nossa propria chave, nao pode.
 *
 * O token do webhook (asaas-access-token) e conferido so para LOG. Se nao
 * bater — inclusive se o Asaas ainda nao tiver sido configurado — o evento e
 * ignorado sem erro (200), porque um webhook mal configurado no painel do
 * Asaas nao deveria virar erro 500 nem reentrega agressiva por parte deles.
 */
@Injectable()
export class AsaasWebhookService {
  private readonly log = new Logger(AsaasWebhookService.name);

  constructor(
    private readonly db: ContextoDbService,
    private readonly config: ConfigPlataformaService,
  ) {}

  async processar(
    headers: Record<string, string | string[] | undefined>,
    corpo: unknown,
  ): Promise<{ ok: true }> {
    const asaas = await this.config.obterCliente().catch(() => null);
    if (!asaas) return { ok: true };

    if (!asaas.tokenDoWebhookConfere(headers)) {
      this.log.warn('Webhook do Asaas com token ausente ou invalido — reconfirmando via API.');
    }

    const paymentId = (corpo as { payment?: { id?: string } })?.payment?.id;
    if (!paymentId) return { ok: true };

    const situacao = await asaas.consultarPagamento(paymentId);
    if (!situacao.assinaturaGatewayId) return { ok: true }; // nao e uma cobranca de assinatura
    if (situacao.valorCentavos <= 0) {
      // Nao deveria acontecer para uma cobranca de assinatura real; melhor
      // logar e nao gravar um pagamento de valor invalido do que quebrar
      // a constraint do banco (valor_centavos > 0).
      this.log.warn(`Pagamento ${paymentId} sem valor valido (${situacao.valorCentavos}).`);
      return { ok: true };
    }

    const assinatura = await this.db.comoSistema('webhook: localizar assinatura', (trx) =>
      trx
        .selectFrom('assinaturas')
        .selectAll()
        .where('gateway_subscription_id', '=', situacao.assinaturaGatewayId!)
        .executeTakeFirst(),
    );
    if (!assinatura) {
      this.log.warn(`Webhook para assinatura desconhecida: ${situacao.assinaturaGatewayId}`);
      return { ok: true };
    }

    await this.db.comoSistema('webhook: conciliar pagamento', async (trx) => {
      const statusPagamento =
        situacao.status === 'PAGA'
          ? 'confirmado'
          : situacao.status === 'VENCIDA'
            ? 'recusado'
            : situacao.status === 'CANCELADA'
              ? 'cancelado'
              : situacao.status === 'ESTORNADA'
                ? 'estornado'
                : 'pendente';

      await trx
        .insertInto('pagamentos')
        .values({
          tenant_id: assinatura.tenant_id,
          assinatura_id: assinatura.id,
          valor_centavos: situacao.valorCentavos,
          metodo: situacao.metodo,
          status: statusPagamento,
          gateway_payment_id: situacao.externalId,
          pago_em: situacao.pagoEm,
        })
        .onConflict((oc) =>
          oc.column('gateway_payment_id').doUpdateSet({
            metodo: situacao.metodo,
            status: statusPagamento,
            pago_em: situacao.pagoEm,
          }),
        )
        .execute();

      if (situacao.status === 'PAGA' && assinatura.status !== 'ativa') {
        await trx
          .updateTable('assinaturas')
          .set({ status: 'ativa' })
          .where('id', '=', assinatura.id)
          .execute();
        await trx
          .updateTable('tenants')
          .set({ status: 'ativo' })
          .where('id', '=', assinatura.tenant_id)
          .execute();
        this.log.log(`Tenant ${assinatura.tenant_id} desbloqueado — pagamento confirmado.`);
      }

      // Renovacao recusada (assinatura ja estava ativa): volta pro fluxo de
      // cobranca, o mesmo caminho do fim de trial (Opcao B).
      if (situacao.status === 'VENCIDA' && assinatura.status === 'ativa') {
        await trx
          .updateTable('assinaturas')
          .set({ status: 'inadimplente' })
          .where('id', '=', assinatura.id)
          .execute();
        await trx
          .updateTable('tenants')
          .set({ status: 'inadimplente' })
          .where('id', '=', assinatura.tenant_id)
          .execute();
        this.log.warn(`Tenant ${assinatura.tenant_id} bloqueado — renovacao nao paga.`);
      }
    });

    return { ok: true };
  }
}
