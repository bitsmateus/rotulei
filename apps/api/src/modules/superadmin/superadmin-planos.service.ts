import { Injectable, NotFoundException } from '@nestjs/common';
import type { Updateable } from 'kysely';
import { ContextoDbService } from '../../database/contexto-db.service.js';
import type { EditarPlanoDto } from './superadmin-planos.dto.js';
import type { PlanoTable } from '../../database/tipos.js';
import type { Plano } from '@rotulei/shared';

function paraApi(l: {
  id: string;
  codigo: string;
  nome: string;
  preco_mensal_centavos: number;
  preco_anual_centavos: number | null;
  preco_por_loja: boolean;
  limite_lojas: number | null;
  recursos: Record<string, unknown>;
  ativo: boolean;
}): Plano {
  return {
    id: l.id,
    codigo: l.codigo,
    nome: l.nome,
    precoMensalCentavos: l.preco_mensal_centavos,
    precoAnualCentavos: l.preco_anual_centavos,
    precoPorLoja: l.preco_por_loja,
    limiteLojas: l.limite_lojas,
    recursos: l.recursos,
    ativo: l.ativo,
  };
}

/**
 * "Gerenciar planos — preco e limites editaveis sem precisar de deploy"
 * (ESCOPO.md, secao Superadmin). Diferente de PlanosService (catalogo
 * PUBLICO, so ativos): aqui o superadmin ve e edita tudo, inclusive
 * inativos — a policy `planos_escrita` ja exige app_e_global() para
 * qualquer INSERT/UPDATE/DELETE, entao a request do superadmin passa
 * pela RLS normal, sem precisar de comoSistema.
 */
@Injectable()
export class SuperadminPlanosService {
  constructor(private readonly db: ContextoDbService) {}

  async listar(): Promise<Plano[]> {
    const linhas = await this.db.comContextoDoRequest((trx) =>
      trx.selectFrom('planos').selectAll().orderBy('preco_mensal_centavos', 'asc').execute(),
    );
    return linhas.map(paraApi);
  }

  async editar(id: string, dto: EditarPlanoDto): Promise<Plano> {
    const valores: Updateable<PlanoTable> = {};
    if (dto.nome !== undefined) valores.nome = dto.nome;
    if (dto.precoMensalCentavos !== undefined) valores.preco_mensal_centavos = dto.precoMensalCentavos;
    if (dto.precoAnualCentavos !== undefined) valores.preco_anual_centavos = dto.precoAnualCentavos;
    if (dto.precoPorLoja !== undefined) valores.preco_por_loja = dto.precoPorLoja;
    if (dto.limiteLojas !== undefined) valores.limite_lojas = dto.limiteLojas;
    if (dto.ativo !== undefined) valores.ativo = dto.ativo;

    if (Object.keys(valores).length === 0) {
      const atual = await this.db.comContextoDoRequest((trx) =>
        trx.selectFrom('planos').selectAll().where('id', '=', id).executeTakeFirst(),
      );
      if (!atual) throw new NotFoundException('Plano nao encontrado.');
      return paraApi(atual);
    }

    const linha = await this.db.comContextoDoRequest((trx) =>
      trx
        .updateTable('planos')
        .set(valores)
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirst(),
    );
    if (!linha) throw new NotFoundException('Plano nao encontrado.');
    return paraApi(linha);
  }
}
