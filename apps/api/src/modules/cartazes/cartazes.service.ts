import { Injectable, NotFoundException } from '@nestjs/common';
import { ContextoDbService } from '../../database/contexto-db.service.js';
import type { CartazTable } from '../../database/tipos.js';
import type { UsuarioAutenticado } from '../../common/decorators/usuario-atual.decorator.js';
import type { Selectable } from 'kysely';
import type { CartazDto } from './cartazes.dto.js';

type LinhaCartaz = Selectable<CartazTable>;

/**
 * Repare no que NAO existe neste arquivo: nenhum `where('tenant_id', '=', ...)`.
 *
 * Nao e esquecimento — e o ponto do desenho. O escopo pede que o isolamento
 * venha da politica de RLS, nao de logica espalhada pela aplicacao. O
 * ContextoDbService injeta `app.tenant_id` na transacao e o Postgres aplica o
 * filtro. Uma query nova, escrita por alguem que nunca ouviu falar de tenant,
 * ja nasce isolada.
 *
 * O `tenant_id` do INSERT vem do usuario autenticado (JWT assinado), e a
 * politica de WITH CHECK recusa qualquer outro valor.
 */
@Injectable()
export class CartazesService {
  constructor(private readonly db: ContextoDbService) {}

  async listar(limite = 100) {
    const linhas = await this.db.comContextoDoRequest((trx) =>
      trx
        .selectFrom('cartazes')
        .selectAll()
        .orderBy('criado_em', 'desc')
        .limit(Math.min(limite, 500))
        .execute(),
    );
    return linhas.map(paraApi);
  }

  async buscar(id: string) {
    const linha = await this.db.comContextoDoRequest((trx) =>
      trx.selectFrom('cartazes').selectAll().where('id', '=', id).executeTakeFirst(),
    );

    // Cartaz de outro tenant e cartaz inexistente dao a MESMA resposta: 404.
    // Um 403 aqui confirmaria que o id existe, o que ja e um vazamento.
    if (!linha) throw new NotFoundException('Cartaz nao encontrado.');
    return paraApi(linha);
  }

  async criar(dto: CartazDto, usuario: UsuarioAutenticado) {
    const linha = await this.db.comContextoDoRequest((trx) =>
      trx
        .insertInto('cartazes')
        .values({
          ...paraBanco(dto),
          tenant_id: usuario.tenantId!,
          // Operador fixado numa loja carimba a loja dele automaticamente.
          loja_id: dto.lojaId ?? usuario.lojaId,
          criado_por: usuario.id,
        })
        .returningAll()
        .executeTakeFirstOrThrow(),
    );
    return paraApi(linha);
  }

  async atualizar(id: string, dto: CartazDto) {
    const linha = await this.db.comContextoDoRequest((trx) =>
      trx
        .updateTable('cartazes')
        .set(paraBanco(dto))
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirst(),
    );
    if (!linha) throw new NotFoundException('Cartaz nao encontrado.');
    return paraApi(linha);
  }

  async remover(id: string) {
    const resultado = await this.db.comContextoDoRequest((trx) =>
      trx.deleteFrom('cartazes').where('id', '=', id).executeTakeFirst(),
    );
    if (resultado.numDeletedRows === 0n) {
      throw new NotFoundException('Cartaz nao encontrado.');
    }
  }
}

/** snake_case do banco -> camelCase do contrato Cartaz do MVP. */
function paraApi(l: LinhaCartaz) {
  return {
    id: l.id,
    tenantId: l.tenant_id,
    lojaId: l.loja_id,
    criadoPor: l.criado_por,
    produto: l.produto,
    subtitulo: l.subtitulo,
    peso: l.peso,
    preco: l.preco,
    precoDe: l.preco_de,
    unidade: l.unidade,
    minUnidades: l.min_unidades,
    precoAvulso: l.preco_avulso,
    caixaQtd: l.caixa_qtd,
    caixaPreco: l.caixa_preco,
    precoLitro: l.preco_litro,
    textoFaixa: l.texto_faixa,
    mostrarFaixa: l.mostrar_faixa,
    mostrarDePor: l.mostrar_de_por,
    mostrarLogo: l.mostrar_logo,
    mostrarBolinhaPreco: l.mostrar_bolinha_preco,
    mostrarPrecoAvulsoCaixa: l.mostrar_preco_avulso_caixa,
    temaId: l.tema_id,
    fonte: l.fonte,
    ajusteNome: l.ajuste_nome,
    ajusteSubtitulo: l.ajuste_subtitulo,
    ajusteFaixa: l.ajuste_faixa,
    ajustePreco: l.ajuste_preco,
    ajustePeso: l.ajuste_peso,
    criadoEm: l.criado_em,
    atualizadoEm: l.atualizado_em,
  };
}

function paraBanco(d: CartazDto) {
  return {
    produto: d.produto,
    subtitulo: d.subtitulo ?? '',
    peso: d.peso ?? '',
    preco: d.preco ?? '',
    preco_de: d.precoDe ?? '',
    unidade: d.unidade ?? '',
    min_unidades: d.minUnidades ?? '',
    preco_avulso: d.precoAvulso ?? '',
    caixa_qtd: d.caixaQtd ?? '12',
    caixa_preco: d.caixaPreco ?? '',
    preco_litro: d.precoLitro ?? '',
    texto_faixa: d.textoFaixa ?? 'OFERTA',
    mostrar_faixa: d.mostrarFaixa ?? true,
    mostrar_de_por: d.mostrarDePor ?? false,
    mostrar_logo: d.mostrarLogo ?? true,
    mostrar_bolinha_preco: d.mostrarBolinhaPreco ?? true,
    mostrar_preco_avulso_caixa: d.mostrarPrecoAvulsoCaixa ?? false,
    tema_id: d.temaId ?? 'laranja',
    fonte: d.fonte ?? 'MastersBlack',
    ajuste_nome: d.ajusteNome ?? 0,
    ajuste_subtitulo: d.ajusteSubtitulo ?? 0,
    ajuste_faixa: d.ajusteFaixa ?? 0,
    ajuste_preco: d.ajustePreco ?? 0,
    ajuste_peso: d.ajustePeso ?? 0,
  };
}
