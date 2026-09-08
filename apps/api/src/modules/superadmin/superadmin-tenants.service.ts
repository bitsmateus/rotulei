import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { mensalidadeCentavos, STATUS_TENANT, type StatusTenant } from '@rotulei/shared';
import { ContextoDbService } from '../../database/contexto-db.service.js';

export interface TenantParaSuperadmin {
  id: string;
  nome: string;
  cnpj: string;
  slug: string;
  status: StatusTenant;
  plano: { id: string; codigo: string; nome: string };
  qtdLojas: number;
  mrrCentavos: number;
  proximaCobrancaEm: Date | null;
  /** true = a data acima e uma estimativa (ainda nao veio de um webhook do Asaas). */
  proximaCobrancaEstimada: boolean;
  trialTerminaEm: Date | null;
  criadoEm: Date;
}

export interface MetricasPlataforma {
  mrrTotalCentavos: number;
  tenantsAtivos: number;
  tenantsEmTrial: number;
  tenantsInadimplentes: number;
  tenantsSuspensos: number;
  tenantsCancelados: number;
}

/**
 * Leitura e acao manual do superadmin sobre tenants (ESCOPO.md, secao
 * Superadmin). Roda com o contexto da propria request — superadmin ja e
 * `app_e_global()`, entao ve todos os tenants pela RLS normal, sem precisar
 * de comoSistema.
 */
@Injectable()
export class SuperadminTenantsService {
  constructor(private readonly db: ContextoDbService) {}

  async listar(): Promise<TenantParaSuperadmin[]> {
    return this.db.comContextoDoRequest(async (trx) => {
      const tenants = await trx
        .selectFrom('tenants')
        .innerJoin('planos', 'planos.id', 'tenants.plano_id')
        .select([
          'tenants.id',
          'tenants.nome',
          'tenants.cnpj',
          'tenants.slug',
          'tenants.status',
          'tenants.trial_termina_em',
          'tenants.criado_em',
          'planos.id as plano_id',
          'planos.codigo as plano_codigo',
          'planos.nome as plano_nome',
          'planos.preco_mensal_centavos',
          'planos.preco_anual_centavos',
          'planos.preco_por_loja',
          'planos.limite_lojas',
          'planos.recursos',
          'planos.ativo as plano_ativo',
        ])
        .orderBy('tenants.criado_em', 'desc')
        .execute();

      if (tenants.length === 0) return [];

      const idsTenants = tenants.map((t) => t.id);

      const lojasPorTenant = await trx
        .selectFrom('lojas')
        .select(['tenant_id', (eb) => eb.fn.countAll().as('qtd')])
        .where('tenant_id', 'in', idsTenants)
        .groupBy('tenant_id')
        .execute();
      const qtdLojas = new Map(lojasPorTenant.map((l) => [l.tenant_id, Number(l.qtd)]));

      const assinaturas = await trx
        .selectFrom('assinaturas')
        .select(['tenant_id', 'proxima_cobranca_em', 'ciclo'])
        .where('tenant_id', 'in', idsTenants)
        .execute();
      const assinaturaPorTenant = new Map(assinaturas.map((a) => [a.tenant_id, a]));

      // Estimativa quando o Asaas ainda nao informou a proxima data: ultimo
      // pagamento confirmado + 1 ciclo. Sem isso a coluna fica vazia para
      // praticamente todo tenant, ja que nao gravamos proxima_cobranca_em
      // ao confirmar um pagamento (ver AUDITORIA.md — pendencia de conciliacao).
      const ultimosPagamentos = await trx
        .selectFrom('pagamentos')
        .select(['tenant_id', 'pago_em'])
        .where('tenant_id', 'in', idsTenants)
        .where('status', '=', 'confirmado')
        .where('pago_em', 'is not', null)
        .orderBy('pago_em', 'desc')
        .execute();
      const ultimoPagoPorTenant = new Map<string, Date>();
      for (const p of ultimosPagamentos) {
        if (!ultimoPagoPorTenant.has(p.tenant_id) && p.pago_em) {
          ultimoPagoPorTenant.set(p.tenant_id, p.pago_em);
        }
      }

      return tenants.map((t): TenantParaSuperadmin => {
        const plano = {
          id: t.plano_id,
          codigo: t.plano_codigo,
          nome: t.plano_nome,
          precoMensalCentavos: t.preco_mensal_centavos,
          precoAnualCentavos: t.preco_anual_centavos,
          precoPorLoja: t.preco_por_loja,
          limiteLojas: t.limite_lojas,
          recursos: t.recursos,
          ativo: t.plano_ativo,
        };
        const lojas = qtdLojas.get(t.id) ?? 0;
        const assinatura = assinaturaPorTenant.get(t.id);

        let proximaCobrancaEm = assinatura?.proxima_cobranca_em ?? null;
        let proximaCobrancaEstimada = false;
        if (!proximaCobrancaEm) {
          const ultimoPago = ultimoPagoPorTenant.get(t.id);
          if (ultimoPago) {
            const dias = assinatura?.ciclo === 'anual' ? 365 : 30;
            proximaCobrancaEm = new Date(ultimoPago.getTime() + dias * 24 * 60 * 60 * 1000);
            proximaCobrancaEstimada = true;
          }
        }

        return {
          id: t.id,
          nome: t.nome,
          cnpj: t.cnpj,
          slug: t.slug,
          status: t.status,
          plano: { id: plano.id, codigo: plano.codigo, nome: plano.nome },
          qtdLojas: lojas,
          // MRR so conta tenant ATIVO — trial e inadimplente ainda nao pagam.
          mrrCentavos: t.status === 'ativo' ? mensalidadeCentavos(plano, lojas) : 0,
          proximaCobrancaEm,
          proximaCobrancaEstimada,
          trialTerminaEm: t.trial_termina_em,
          criadoEm: t.criado_em,
        };
      });
    });
  }

  async metricas(): Promise<MetricasPlataforma> {
    const tenants = await this.listar();

    return {
      mrrTotalCentavos: tenants.reduce((soma, t) => soma + t.mrrCentavos, 0),
      tenantsAtivos: tenants.filter((t) => t.status === 'ativo').length,
      tenantsEmTrial: tenants.filter((t) => t.status === 'trial').length,
      tenantsInadimplentes: tenants.filter((t) => t.status === 'inadimplente').length,
      tenantsSuspensos: tenants.filter((t) => t.status === 'suspenso').length,
      tenantsCancelados: tenants.filter((t) => t.status === 'cancelado').length,
    };
  }

  /**
   * Muda o status manualmente — suspender/reativar (ESCOPO.md). O trigger
   * `tenants_protege_status` ja recusa isso fora do contexto global; aqui so
   * validamos a ENTRADA (status valido) e devolvemos 404 se o tenant nao
   * existir, em vez de deixar a constraint estourar um erro cru.
   */
  async alterarStatus(tenantId: string, status: StatusTenant): Promise<TenantParaSuperadmin> {
    if (!STATUS_TENANT.includes(status)) {
      throw new BadRequestException('Status invalido.');
    }

    const atualizado = await this.db.comContextoDoRequest((trx) =>
      trx
        .updateTable('tenants')
        .set({ status })
        .where('id', '=', tenantId)
        .returning('id')
        .executeTakeFirst(),
    );
    if (!atualizado) throw new NotFoundException('Tenant nao encontrado.');

    const lista = await this.listar();
    const tenant = lista.find((t) => t.id === tenantId);
    if (!tenant) throw new NotFoundException('Tenant nao encontrado.');
    return tenant;
  }
}
