import { Injectable } from '@nestjs/common';
import { ContextoDbService } from '../../database/contexto-db.service.js';
import { mensalidadeCentavos, type Plano } from '@rotulei/shared';

@Injectable()
export class PlanosService {
  constructor(private readonly db: ContextoDbService) {}

  /**
   * Catalogo publico — a pagina de cadastro precisa listar plano e preco antes
   * de existir login. A politica `planos_leitura` libera apenas os ativos.
   */
  async listarPublicos(): Promise<Plano[]> {
    const linhas = await this.db.comoAnonimo((trx) =>
      trx
        .selectFrom('planos')
        .selectAll()
        .orderBy('preco_mensal_centavos', 'asc')
        .execute(),
    );

    return linhas.map(
      (l): Plano => ({
        id: l.id,
        codigo: l.codigo,
        nome: l.nome,
        precoMensalCentavos: l.preco_mensal_centavos,
        precoAnualCentavos: l.preco_anual_centavos,
        precoPorLoja: l.preco_por_loja,
        limiteLojas: l.limite_lojas,
        recursos: l.recursos,
        ativo: l.ativo,
      }),
    );
  }
}

export { mensalidadeCentavos };
