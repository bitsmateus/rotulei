import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Loja } from '@rotulei/shared';
import { ContextoDbService } from '../../database/contexto-db.service.js';
import { ehViolacaoDeUnicidade } from '../../common/db/erros-postgres.js';
import type { UsuarioAutenticado } from '../../common/decorators/usuario-atual.decorator.js';
import type { CriarLojaDto, EditarLojaDto } from './lojas.dto.js';
import type { LojaTable } from '../../database/tipos.js';
import type { Selectable } from 'kysely';

function paraApi(l: Selectable<LojaTable>): Loja {
  return {
    id: l.id,
    tenantId: l.tenant_id,
    nome: l.nome,
    endereco: l.endereco,
    criadoEm: l.criado_em,
    atualizadoEm: l.atualizado_em,
  };
}

/**
 * CRUD de lojas do tenant (item 7, ESCOPO.md). Sem `where tenant_id = ...` em
 * lugar nenhum — a RLS de `lojas` (0007_rls_policies.sql) ja restringe leitura
 * e escrita ao tenant do contexto, e exige admin para insert/update/delete.
 */
@Injectable()
export class LojasService {
  constructor(private readonly db: ContextoDbService) {}

  async listar(): Promise<Loja[]> {
    const linhas = await this.db.comContextoDoRequest((trx) =>
      trx.selectFrom('lojas').selectAll().orderBy('nome', 'asc').execute(),
    );
    return linhas.map(paraApi);
  }

  async criar(dto: CriarLojaDto, usuario: UsuarioAutenticado): Promise<Loja> {
    const tenantId = usuario.tenantId!;

    try {
      const linha = await this.db.comContextoDoRequest(async (trx) => {
        const tenant = await trx
          .selectFrom('tenants')
          .innerJoin('planos', 'planos.id', 'tenants.plano_id')
          .select(['planos.limite_lojas'])
          .where('tenants.id', '=', tenantId)
          .executeTakeFirstOrThrow();

        if (tenant.limite_lojas !== null) {
          const { count } = await trx
            .selectFrom('lojas')
            .select((eb) => eb.fn.countAll().as('count'))
            .where('tenant_id', '=', tenantId)
            .executeTakeFirstOrThrow();

          if (Number(count) >= tenant.limite_lojas) {
            throw new BadRequestException(
              'Limite de lojas do plano atual atingido. Faca upgrade de plano para cadastrar mais lojas.',
            );
          }
        }

        return trx
          .insertInto('lojas')
          .values({
            tenant_id: tenantId,
            nome: dto.nome.trim(),
            endereco: dto.endereco?.trim() || null,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
      });
      return paraApi(linha);
    } catch (erro) {
      if (ehViolacaoDeUnicidade(erro) && erro.constraint === 'lojas_nome_por_tenant_uk') {
        throw new ConflictException('Ja existe uma loja com este nome.');
      }
      throw erro;
    }
  }

  async editar(id: string, dto: EditarLojaDto): Promise<Loja> {
    const valores: { nome?: string; endereco?: string | null } = {};
    if (dto.nome !== undefined) valores.nome = dto.nome.trim();
    if (dto.endereco !== undefined) valores.endereco = dto.endereco?.trim() || null;

    try {
      const linha =
        Object.keys(valores).length === 0
          ? await this.db.comContextoDoRequest((trx) =>
              trx.selectFrom('lojas').selectAll().where('id', '=', id).executeTakeFirst(),
            )
          : await this.db.comContextoDoRequest((trx) =>
              trx.updateTable('lojas').set(valores).where('id', '=', id).returningAll().executeTakeFirst(),
            );

      if (!linha) throw new NotFoundException('Loja nao encontrada.');
      return paraApi(linha);
    } catch (erro) {
      if (ehViolacaoDeUnicidade(erro) && erro.constraint === 'lojas_nome_por_tenant_uk') {
        throw new ConflictException('Ja existe uma loja com este nome.');
      }
      throw erro;
    }
  }

  async remover(id: string): Promise<void> {
    const resultado = await this.db.comContextoDoRequest((trx) =>
      trx.deleteFrom('lojas').where('id', '=', id).executeTakeFirst(),
    );
    if (resultado.numDeletedRows === 0n) {
      throw new NotFoundException('Loja nao encontrada.');
    }
  }
}
