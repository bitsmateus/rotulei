import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common';
import { mensalidadeCentavos } from '@rotulei/shared';
import { ContextoDbService } from '../../database/contexto-db.service.js';
import { ConfigPlataformaService } from '../config-plataforma/config-plataforma.service.js';
import type { UsuarioAutenticado } from '../../common/decorators/usuario-atual.decorator.js';

/**
 * Fluxo de desbloqueio do tenant inadimplente (Opcao B — DECISOES.md #18).
 *
 * Nunca recebe dado de cartao: gera um link de checkout hospedado no proprio
 * Asaas e devolve para o front redirecionar. Quem confirma o pagamento e o
 * AsaasWebhookService, nunca este endpoint.
 */
@Injectable()
export class AssinaturaService {
  private readonly log = new Logger(AssinaturaService.name);

  constructor(
    private readonly db: ContextoDbService,
    private readonly config: ConfigPlataformaService,
  ) {}

  /** Situacao atual — para a tela de cobranca mostrar algo alem do botao. */
  async obterStatus(usuario: UsuarioAutenticado) {
    if (!usuario.tenantId) throw new BadRequestException('Superadmin nao tem assinatura.');

    return this.db.comContextoDoRequest(async (trx) => {
      const tenant = await trx
        .selectFrom('tenants')
        .select(['status'])
        .where('id', '=', usuario.tenantId!)
        .executeTakeFirstOrThrow();

      const assinatura = await trx
        .selectFrom('assinaturas')
        .selectAll()
        .where('tenant_id', '=', usuario.tenantId!)
        .executeTakeFirst();

      const ultimoPagamento = await trx
        .selectFrom('pagamentos')
        .selectAll()
        .where('tenant_id', '=', usuario.tenantId!)
        .orderBy('criado_em', 'desc')
        .executeTakeFirst();

      return {
        statusTenant: tenant.status,
        assinatura: assinatura ?? null,
        ultimoPagamento: ultimoPagamento ?? null,
      };
    });
  }

  /** Cria (ou reaproveita) a assinatura no Asaas e devolve o link de checkout. */
  async iniciarCheckout(usuario: UsuarioAutenticado): Promise<{ checkoutUrl: string }> {
    if (!usuario.tenantId) throw new BadRequestException('Superadmin nao tem assinatura.');
    const tenantId = usuario.tenantId;

    const { tenant, plano, qtdLojas } = await this.db.comContextoDoRequest(async (trx) => {
      const t = await trx
        .selectFrom('tenants')
        .select(['id', 'nome', 'cnpj', 'plano_id'])
        .where('id', '=', tenantId)
        .executeTakeFirstOrThrow();

      const p = await trx
        .selectFrom('planos')
        .selectAll()
        .where('id', '=', t.plano_id)
        .executeTakeFirstOrThrow();

      const { count } = await trx
        .selectFrom('lojas')
        .select((eb) => eb.fn.countAll().as('count'))
        .where('tenant_id', '=', tenantId)
        .executeTakeFirstOrThrow();

      return { tenant: t, plano: p, qtdLojas: Number(count) };
    });

    if (!tenant.cnpj) {
      throw new BadRequestException('Cadastre o CNPJ do mercado antes de assinar.');
    }

    const valorCentavos = mensalidadeCentavos(
      {
        id: plano.id,
        codigo: plano.codigo,
        nome: plano.nome,
        precoMensalCentavos: plano.preco_mensal_centavos,
        precoAnualCentavos: plano.preco_anual_centavos,
        precoPorLoja: plano.preco_por_loja,
        limiteLojas: plano.limite_lojas,
        recursos: plano.recursos,
        ativo: plano.ativo,
      },
      qtdLojas,
    );

    if (valorCentavos <= 0) {
      throw new BadRequestException(
        'Este plano e sob consulta — fale com a NX para fechar o valor antes de assinar.',
      );
    }

    const asaas = await this.config.obterCliente();

    let resultado;
    try {
      const customerId = await asaas.garantirCliente({ nome: tenant.nome, cnpj: tenant.cnpj });
      resultado = await asaas.criarAssinaturaComCheckout({
        customerId,
        valorCentavos,
        ciclo: 'mensal',
        descricao: `Rotulei — plano ${plano.nome}`,
        externalRef: tenantId,
      });
    } catch (erro) {
      // A causa exata (chave invalida, sandbox fora do ar, rate limit) so
      // interessa ao log — pro tenant, "tente de novo" e o que da pra fazer.
      // Se o erro persistir, o problema e a config do superadmin, nao algo
      // que o tenant resolva sozinho.
      this.log.error(`Falha ao criar checkout no Asaas para o tenant ${tenantId}: ${erro}`);
      throw new BadGatewayException(
        'Nao foi possivel iniciar o pagamento agora. Tente novamente em alguns minutos.',
      );
    }

    // Escrita como 'sistema', no mesmo espirito do status do tenant: o dado
    // de assinatura reflete o gateway, nunca e preenchido por uma pessoa.
    await this.db.comoSistema('checkout de assinatura', (trx) =>
      trx
        .insertInto('assinaturas')
        .values({
          tenant_id: tenantId,
          plano_id: plano.id,
          gateway_subscription_id: resultado.assinaturaGatewayId,
          status: 'pendente',
        })
        .onConflict((oc) =>
          oc.column('tenant_id').doUpdateSet({
            plano_id: plano.id,
            gateway_subscription_id: resultado.assinaturaGatewayId,
            status: 'pendente',
          }),
        )
        .execute(),
    );

    return { checkoutUrl: resultado.checkoutUrl };
  }
}
