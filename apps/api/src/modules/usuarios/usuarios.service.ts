import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Usuario } from '@rotulei/shared';
import type { Selectable, Updateable } from 'kysely';
import { ContextoDbService, type Trx } from '../../database/contexto-db.service.js';
import { ehViolacaoDeChaveEstrangeira, ehViolacaoDeUnicidade } from '../../common/db/erros-postgres.js';
import { AuthService } from '../auth/auth.service.js';
import type { UsuarioAutenticado } from '../../common/decorators/usuario-atual.decorator.js';
import type { CriarUsuarioDto, EditarUsuarioDto } from './usuarios.dto.js';
import type { UsuarioTable } from '../../database/tipos.js';

function paraApi(u: Selectable<UsuarioTable>): Usuario {
  return {
    id: u.id,
    tenantId: u.tenant_id,
    lojaId: u.loja_id,
    nome: u.nome,
    email: u.email,
    papel: u.papel,
    cpf: u.cpf,
    telefone: u.telefone,
    ativo: u.ativo,
    ultimoLoginEm: u.ultimo_login_em,
    criadoEm: u.criado_em,
    atualizadoEm: u.atualizado_em,
  };
}

/**
 * Gasta uma query a mais para dar um erro de dominio em vez do 500 generico
 * que a FK composta `usuarios_loja_do_mesmo_tenant` devolveria (AUDITORIA.md,
 * pendencia "normalizar erros de dominio" — item 6).
 */
async function validarLojaDoTenant(trx: Trx, lojaId: string | null | undefined, tenantId: string) {
  if (!lojaId) return;
  const loja = await trx
    .selectFrom('lojas')
    .select('id')
    .where('id', '=', lojaId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();
  if (!loja) throw new BadRequestException('Loja nao encontrada neste tenant.');
}

/** Quantos admins ativos alem de `excluirId` o tenant ainda tem. */
async function contarOutrosAdminsAtivos(trx: Trx, tenantId: string, excluirId: string): Promise<number> {
  const { count } = await trx
    .selectFrom('usuarios')
    .select((eb) => eb.fn.countAll().as('count'))
    .where('tenant_id', '=', tenantId)
    .where('papel', '=', 'admin')
    .where('ativo', '=', true)
    .where('id', '!=', excluirId)
    .executeTakeFirstOrThrow();
  return Number(count);
}

/**
 * CRUD de usuarios (operadores e outros admins) do tenant — item 7. Mesma
 * logica de RLS de `lojas.service.ts`: nenhum `where tenant_id = ...` aqui, a
 * politica de `usuarios` ja restringe ao tenant do contexto e exige admin.
 */
@Injectable()
export class UsuariosService {
  constructor(private readonly db: ContextoDbService) {}

  async listar(): Promise<Usuario[]> {
    const linhas = await this.db.comContextoDoRequest((trx) =>
      trx.selectFrom('usuarios').selectAll().orderBy('nome', 'asc').execute(),
    );
    return linhas.map(paraApi);
  }

  async criar(dto: CriarUsuarioDto, usuario: UsuarioAutenticado): Promise<Usuario> {
    const tenantId = usuario.tenantId!;
    const email = dto.email.trim().toLowerCase();
    const senhaHash = await AuthService.gerarHashDeSenha(dto.senha);

    try {
      const lojaId = dto.papel === 'operador' ? (dto.lojaId ?? null) : null;

      const linha = await this.db.comContextoDoRequest(async (trx) => {
        await validarLojaDoTenant(trx, lojaId, tenantId);

        return trx
          .insertInto('usuarios')
          .values({
            tenant_id: tenantId,
            loja_id: lojaId,
            nome: dto.nome.trim(),
            email,
            papel: dto.papel,
            senha_hash: senhaHash,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
      });
      return paraApi(linha);
    } catch (erro) {
      if (ehViolacaoDeUnicidade(erro) && erro.constraint === 'usuarios_email_uk') {
        throw new ConflictException('Ja existe um usuario com este e-mail.');
      }
      throw erro;
    }
  }

  async editar(id: string, dto: EditarUsuarioDto, usuario: UsuarioAutenticado): Promise<Usuario> {
    const tenantId = usuario.tenantId!;
    const agindoSobreSiMesmo = id === usuario.id;

    if (agindoSobreSiMesmo && dto.papel && dto.papel !== 'admin') {
      throw new BadRequestException('Voce nao pode remover o proprio papel de admin. Peca a outro admin.');
    }
    if (agindoSobreSiMesmo && dto.ativo === false) {
      throw new BadRequestException('Voce nao pode desativar a propria conta. Peca a outro admin.');
    }

    const valores: Updateable<UsuarioTable> = {};
    if (dto.nome !== undefined) valores.nome = dto.nome.trim();
    if (dto.papel !== undefined) valores.papel = dto.papel;
    if (dto.lojaId !== undefined) valores.loja_id = dto.lojaId;
    if (dto.ativo !== undefined) valores.ativo = dto.ativo;

    try {
      const linha = await this.db.comContextoDoRequest(async (trx) => {
        // Nao deixa o tenant ficar sem nenhum admin ativo capaz de gerenciar
        // a propria conta/cobranca — quem resolveria isso seria o suporte.
        if ((dto.papel === 'operador' || dto.ativo === false) && !agindoSobreSiMesmo) {
          const alvo = await trx
            .selectFrom('usuarios')
            .select(['papel', 'ativo'])
            .where('id', '=', id)
            .executeTakeFirst();

          if (alvo?.papel === 'admin' && alvo.ativo) {
            const outros = await contarOutrosAdminsAtivos(trx, tenantId, id);
            if (outros === 0) {
              throw new BadRequestException(
                'Este e o unico admin ativo do tenant. Promova outro usuario a admin antes.',
              );
            }
          }
        }

        if (dto.lojaId !== undefined) await validarLojaDoTenant(trx, dto.lojaId, tenantId);

        if (Object.keys(valores).length === 0) {
          return trx.selectFrom('usuarios').selectAll().where('id', '=', id).executeTakeFirst();
        }
        return trx.updateTable('usuarios').set(valores).where('id', '=', id).returningAll().executeTakeFirst();
      });

      if (!linha) throw new NotFoundException('Usuario nao encontrado.');
      return paraApi(linha);
    } catch (erro) {
      if (ehViolacaoDeChaveEstrangeira(erro)) {
        throw new BadRequestException('Loja nao encontrada neste tenant.');
      }
      throw erro;
    }
  }

  async remover(id: string, usuario: UsuarioAutenticado): Promise<void> {
    if (id === usuario.id) {
      throw new BadRequestException('Voce nao pode remover a propria conta. Peca a outro admin.');
    }
    const tenantId = usuario.tenantId!;

    const resultado = await this.db.comContextoDoRequest(async (trx) => {
      const alvo = await trx
        .selectFrom('usuarios')
        .select(['papel', 'ativo'])
        .where('id', '=', id)
        .executeTakeFirst();

      if (alvo?.papel === 'admin' && alvo.ativo) {
        const outros = await contarOutrosAdminsAtivos(trx, tenantId, id);
        if (outros === 0) {
          throw new BadRequestException(
            'Este e o unico admin ativo do tenant. Promova outro usuario a admin antes.',
          );
        }
      }

      return trx.deleteFrom('usuarios').where('id', '=', id).executeTakeFirst();
    });

    if (resultado.numDeletedRows === 0n) {
      throw new NotFoundException('Usuario nao encontrado.');
    }
  }
}
