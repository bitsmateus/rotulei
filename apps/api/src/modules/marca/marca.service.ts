import { BadRequestException, Injectable } from '@nestjs/common';
import { planoTemMarcaPropria } from '@rotulei/shared';
import { ContextoDbService } from '../../database/contexto-db.service.js';
import type { UsuarioAutenticado } from '../../common/decorators/usuario-atual.decorator.js';
import type { EditarMarcaDto } from './marca.dto.js';

export interface MarcaDoTenant {
  logoDataUrl: string | null;
  corPrimaria: string | null;
  corSecundaria: string | null;
  /** Plano atual do tenant inclui marca propria (ESCOPO.md — Rede/Enterprise). */
  marcaPropriaDisponivel: boolean;
}

/**
 * Marca propria do tenant (item 7) — logo e paleta. So o LOGO e aplicado ao
 * cartaz hoje (CartazA4 ja aceita `logoUrl`); as cores ficam guardadas mas
 * ainda nao entram no motor de cartaz — ver DECISOES.md: os 6 temas fixos sao
 * porte do MVP, nao reprojeto (CLAUDE.md, regra 5), e uma paleta customizada
 * exigiria um tema dinamico, decisao de produto que fica para depois.
 */
@Injectable()
export class MarcaService {
  constructor(private readonly db: ContextoDbService) {}

  async obter(usuario: UsuarioAutenticado): Promise<MarcaDoTenant> {
    if (!usuario.tenantId) throw new BadRequestException('Superadmin nao tem marca de tenant.');

    return this.db.comContextoDoRequest(async (trx) => {
      const tenant = await trx
        .selectFrom('tenants')
        .innerJoin('planos', 'planos.id', 'tenants.plano_id')
        .select([
          'tenants.logo_data_url',
          'tenants.cor_primaria',
          'tenants.cor_secundaria',
          'planos.recursos',
        ])
        .where('tenants.id', '=', usuario.tenantId!)
        .executeTakeFirstOrThrow();

      return {
        logoDataUrl: tenant.logo_data_url,
        corPrimaria: tenant.cor_primaria,
        corSecundaria: tenant.cor_secundaria,
        marcaPropriaDisponivel: planoTemMarcaPropria({ recursos: tenant.recursos }),
      };
    });
  }

  async editar(dto: EditarMarcaDto, usuario: UsuarioAutenticado): Promise<MarcaDoTenant> {
    if (!usuario.tenantId) throw new BadRequestException('Superadmin nao tem marca de tenant.');
    const tenantId = usuario.tenantId;

    return this.db.comContextoDoRequest(async (trx) => {
      const tenant = await trx
        .selectFrom('tenants')
        .innerJoin('planos', 'planos.id', 'tenants.plano_id')
        .select(['planos.recursos'])
        .where('tenants.id', '=', tenantId)
        .executeTakeFirstOrThrow();

      if (!planoTemMarcaPropria({ recursos: tenant.recursos })) {
        throw new BadRequestException(
          'Marca propria nao esta incluida no plano atual. Faca upgrade para o plano Rede ou Enterprise.',
        );
      }

      const valores: { logo_data_url?: string | null; cor_primaria?: string | null; cor_secundaria?: string | null } = {};
      if (dto.logoDataUrl !== undefined) valores.logo_data_url = dto.logoDataUrl;
      if (dto.corPrimaria !== undefined) valores.cor_primaria = dto.corPrimaria;
      if (dto.corSecundaria !== undefined) valores.cor_secundaria = dto.corSecundaria;

      const linha =
        Object.keys(valores).length === 0
          ? await trx
              .selectFrom('tenants')
              .select(['logo_data_url', 'cor_primaria', 'cor_secundaria'])
              .where('id', '=', tenantId)
              .executeTakeFirstOrThrow()
          : await trx
              .updateTable('tenants')
              .set(valores)
              .where('id', '=', tenantId)
              .returning(['logo_data_url', 'cor_primaria', 'cor_secundaria'])
              .executeTakeFirstOrThrow();

      return {
        logoDataUrl: linha.logo_data_url,
        corPrimaria: linha.cor_primaria,
        corSecundaria: linha.cor_secundaria,
        marcaPropriaDisponivel: true,
      };
    });
  }
}
