import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  DIAS_DE_TRIAL,
  apenasDigitos,
  validarCnpj,
  validarCpf,
  validarTelefone,
} from '@rotulei/shared';
import { ContextoDbService } from '../../database/contexto-db.service.js';
import { AuthService } from '../auth/auth.service.js';
import type { CadastroPublicoDto } from './cadastro-publico.dto.js';

/** Erro do Postgres para violacao de unicidade (`unique_violation`). */
const CODIGO_UNIQUE_VIOLATION = '23505';

function ehViolacaoDeUnicidade(erro: unknown): erro is { code: string; constraint?: string } {
  return (
    typeof erro === 'object' &&
    erro !== null &&
    'code' in erro &&
    (erro as { code: unknown }).code === CODIGO_UNIQUE_VIOLATION
  );
}

/**
 * Slug a partir do nome do mercado: minusculas, sem acento, so [a-z0-9-].
 * Precisa bater com a constraint `tenants_slug_formato` (comeca e termina com
 * alfanumerico, entre 4 e 50 caracteres).
 */
function gerarSlugBase(nome: string): string {
  const limpo = nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove os acentos separados pelo NFD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const base = limpo || 'mercado';
  return base.length >= 4 ? base.slice(0, 45) : base.padEnd(4, '0');
}

const MAX_TENTATIVAS_DE_SLUG = 5;

@Injectable()
export class CadastroPublicoService {
  constructor(
    private readonly db: ContextoDbService,
    private readonly auth: AuthService,
  ) {}

  /**
   * Cadastro publico: cria tenant em trial, sem pedir cartao (ESCOPO.md), e
   * loga o admin na hora — o mesmo fluxo de um login manual, so que a conta
   * acaba de nascer.
   *
   * Roda como 'sistema': criar um tenant e, por definicao, cross-tenant — nao
   * existe contexto de tenant ainda quando o tenant esta sendo criado.
   */
  async cadastrar(dto: CadastroPublicoDto) {
    const cnpj = apenasDigitos(dto.cnpj);
    const cpf = apenasDigitos(dto.cpf);
    const telefone = apenasDigitos(dto.telefone);
    const email = dto.email.trim().toLowerCase();

    // O DTO so confere FORMATO (contagem de digitos); o digito verificador de
    // verdade (modulo 11) e conferido aqui, contra CPF/CNPJ forjados que
    // passariam num regex mas nao existem de verdade.
    if (!validarCnpj(cnpj)) throw new BadRequestException('CNPJ invalido.');
    if (!validarCpf(cpf)) throw new BadRequestException('CPF invalido.');
    if (!validarTelefone(telefone)) throw new BadRequestException('Telefone invalido.');

    const plano = await this.db.comoAnonimo((trx) =>
      trx
        .selectFrom('planos')
        .select(['id'])
        .where('codigo', '=', dto.planoCodigo)
        .where('ativo', '=', true)
        .executeTakeFirst(),
    );
    if (!plano) throw new NotFoundException('Plano nao encontrado.');

    const senhaHash = await AuthService.gerarHashDeSenha(dto.senha);
    const slugBase = gerarSlugBase(dto.nomeMercado);
    const trialTerminaEm = new Date(Date.now() + DIAS_DE_TRIAL * 24 * 60 * 60 * 1000);

    let tenantId: string | undefined;

    for (let tentativa = 0; tentativa < MAX_TENTATIVAS_DE_SLUG; tentativa++) {
      const slug = tentativa === 0 ? slugBase : `${slugBase}-${tentativa + 1}`;

      try {
        tenantId = await this.db.comoSistema('cadastro publico', async (trx) => {
          const tenant = await trx
            .insertInto('tenants')
            .values({
              nome: dto.nomeMercado.trim(),
              cnpj,
              slug,
              status: 'trial',
              plano_id: plano.id,
              trial_termina_em: trialTerminaEm,
            })
            .returning('id')
            .executeTakeFirstOrThrow();

          await trx
            .insertInto('usuarios')
            .values({
              tenant_id: tenant.id,
              loja_id: null,
              nome: dto.nomeAdmin.trim(),
              email,
              cpf,
              telefone,
              papel: 'admin',
              senha_hash: senhaHash,
            })
            .execute();

          return tenant.id;
        });
        break; // sucesso — sai do laco de tentativas de slug
      } catch (erro) {
        if (!ehViolacaoDeUnicidade(erro)) throw erro;

        // Slug colidiu: tenta o proximo sufixo. CNPJ/e-mail colidindo e erro
        // do USUARIO (conta ja existe), nao algo pra tentar de novo.
        if (erro.constraint === 'tenants_slug_uk' && tentativa < MAX_TENTATIVAS_DE_SLUG - 1) {
          continue;
        }
        if (erro.constraint === 'tenants_cnpj_uk') {
          throw new ConflictException('Ja existe um cadastro com este CNPJ.');
        }
        if (erro.constraint === 'usuarios_email_uk') {
          throw new ConflictException('Ja existe uma conta com este e-mail.');
        }
        if (erro.constraint === 'usuarios_cpf_uk') {
          // E a regra "um trial por pessoa": este CPF ja abriu uma conta,
          // mesmo que com outro e-mail ou outro CNPJ.
          throw new ConflictException('Ja existe uma conta cadastrada com este CPF.');
        }
        if (erro.constraint === 'usuarios_telefone_uk') {
          throw new ConflictException('Ja existe uma conta cadastrada com este telefone.');
        }
        throw erro;
      }
    }

    if (!tenantId) {
      throw new ConflictException('Nao foi possivel gerar um identificador unico para o mercado.');
    }

    // Reaproveita o login normal: emite os tokens do mesmo jeito que um login
    // manual, e ja passa pela checagem de status do tenant recem-criado.
    const tokens = await this.auth.login({ email, senha: dto.senha });
    return { tenantId, ...tokens };
  }
}
