import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { STATUS_QUE_PODE_LOGAR, type PapelUsuario, type StatusTenant } from '@rotulei/shared';
import { ContextoDbService, type Trx } from '../../database/contexto-db.service.js';
import { env } from '../../config/env.js';

export interface ClaimsDoToken {
  /** id do usuario */
  sub: string;
  /** tenant — null para superadmin */
  tid: string | null;
  papel: PapelUsuario;
  /** loja a que o operador esta fixado, se houver */
  lid: string | null;
  /**
   * Tenant inadimplente (Opcao B): true quando o tenant existe mas nao tem
   * acesso ao produto — trial vencido ou cobranca recusada. O usuario AINDA
   * consegue logar (e o ponto: precisa entrar para pagar), mas o
   * BloqueioInadimplenciaGuard recusa toda rota de negocio, deixando passar so
   * as marcadas @PermiteQuandoBloqueado() (auth, checkout de assinatura).
   *
   * Fica desatualizado por ate ACCESS_TOKEN_MINUTOS, como o resto do token —
   * mesmo compromisso ja aceito para suspensao via webhook.
   */
  bloqueado: boolean;
}

export interface ParDeTokens {
  accessToken: string;
  refreshToken: string;
  expiraEm: number;
}

export interface DadosDoLogin {
  email: string;
  senha: string;
  userAgent?: string | null;
  ip?: string | null;
}

/**
 * Parametros do argon2id.
 *
 * Os defaults da biblioteca ja seguem a recomendacao da OWASP; sao explicitados
 * aqui para que uma mudanca de default numa atualizacao de dependencia nao
 * enfraqueca as senhas em silencio.
 */
const ARGON2 = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * Hash descartavel usado quando o e-mail nao existe.
 *
 * Sem isto, "usuario inexistente" responde na hora e "senha errada" demora os
 * ~50ms do argon2 — a diferenca deixa qualquer um enumerar quais e-mails tem
 * conta. Verificar contra um hash fixo iguala os dois caminhos.
 */
const HASH_FANTASMA =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$hR8AbLDA6qCvUEfKUmYqIxJXPBEuHdBPEG/ZULTz5TE';

const oHash = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  private readonly log = new Logger(AuthService.name);

  constructor(
    private readonly db: ContextoDbService,
    private readonly jwt: JwtService,
  ) {}

  // ── login ──────────────────────────────────────────────────────────────────

  /**
   * Roda no contexto 'sistema' de proposito: no login ainda nao se sabe de qual
   * tenant o usuario e — descobrir isso E o login. Este e um dos poucos usos
   * legitimos do caminho cross-tenant.
   */
  async login(dados: DadosDoLogin): Promise<ParDeTokens> {
    const email = dados.email.trim().toLowerCase();

    return this.db.comoSistema('login', async (trx) => {
      const usuario = await trx
        .selectFrom('usuarios')
        .select(['id', 'tenant_id', 'loja_id', 'papel', 'senha_hash', 'ativo'])
        .where('email', '=', email)
        .executeTakeFirst();

      // Tempo constante: sempre verifica um hash, mesmo sem usuario.
      const hash = usuario?.senha_hash ?? HASH_FANTASMA;
      const senhaConfere = await argon2.verify(hash, dados.senha).catch(() => false);

      // Mensagem unica para todos os casos — nao entregar qual dos dois errou.
      if (!usuario || !senhaConfere || !usuario.senha_hash) {
        throw new UnauthorizedException('E-mail ou senha invalidos.');
      }
      if (!usuario.ativo) {
        throw new ForbiddenException('Usuario desativado.');
      }

      const bloqueado = await this.verificarTenantPodeLogar(trx, usuario.tenant_id);

      await trx
        .updateTable('usuarios')
        .set({ ultimo_login_em: new Date() })
        .where('id', '=', usuario.id)
        .execute();

      return this.emitirTokens(trx, {
        usuarioId: usuario.id,
        tenantId: usuario.tenant_id,
        lojaId: usuario.loja_id,
        papel: usuario.papel,
        bloqueado,
        userAgent: dados.userAgent ?? null,
        ip: dados.ip ?? null,
      });
    });
  }

  // ── refresh com rotacao e deteccao de reuso ────────────────────────────────

  async renovar(refreshToken: string, userAgent?: string | null, ip?: string | null) {
    const hash = oHash(refreshToken);

    const resultado = await this.db.comoSistema('refresh de sessao', async (trx) => {
      const sessao = await trx
        .selectFrom('sessoes')
        .select([
          'id',
          'usuario_id',
          'tenant_id',
          'substituida_por',
          'expira_em',
          'revogada_em',
        ])
        .where('token_hash', '=', hash)
        .executeTakeFirst();

      if (!sessao) throw new UnauthorizedException('Sessao invalida.');

      /*
       * Deteccao de reuso. Se este refresh JA foi trocado por outro, o dono
       * legitimo continuou a rotacao — logo, quem esta apresentando este aqui
       * copiou o token. Nao da para saber qual dos dois e o atacante, entao
       * derruba a familia inteira e obriga login novo.
       */
      if (sessao.substituida_por) {
        /*
         * ATENCAO — nao revogue aqui dentro.
         *
         * Lancar a excecao dentro da transacao faz ROLLBACK, e o rollback
         * desfaz a revogacao junto: o atacante levaria 401 e todas as sessoes
         * continuariam validas. A revogacao roda depois, em transacao propria,
         * e so entao o 401 e lancado.
         */
        return { reuso: true as const, usuarioId: sessao.usuario_id };
      }

      if (sessao.revogada_em) throw new UnauthorizedException('Sessao revogada.');
      if (sessao.expira_em.getTime() <= Date.now()) {
        throw new UnauthorizedException('Sessao expirada.');
      }

      const usuario = await trx
        .selectFrom('usuarios')
        .select(['id', 'tenant_id', 'loja_id', 'papel', 'ativo'])
        .where('id', '=', sessao.usuario_id)
        .executeTakeFirst();

      if (!usuario || !usuario.ativo) throw new UnauthorizedException('Sessao invalida.');

      // Revalida o tenant a cada renovacao: e o que faz uma mudanca de status
      // (job de fim de trial, webhook de pagamento, suspensao manual) valer em
      // ate 15 minutos, sem precisar de logout.
      const bloqueado = await this.verificarTenantPodeLogar(trx, usuario.tenant_id);

      const tokens = await this.emitirTokens(trx, {
        usuarioId: usuario.id,
        tenantId: usuario.tenant_id,
        lojaId: usuario.loja_id,
        papel: usuario.papel,
        bloqueado,
        userAgent: userAgent ?? null,
        ip: ip ?? null,
      });

      await trx
        .updateTable('sessoes')
        .set({
          substituida_por: tokens.sessaoId,
          usada_em: new Date(),
          revogada_em: new Date(),
          motivo_revogacao: 'rotacionada',
        })
        .where('id', '=', sessao.id)
        .execute();

      return { reuso: false as const, tokens };
    });

    if (resultado.reuso) {
      // Transacao separada: esta precisa COMITAR antes do 401.
      await this.db.comoSistema('revogacao por reuso de refresh token', (trx) =>
        this.revogarTodasAsSessoes(trx, resultado.usuarioId, 'reuso de refresh token'),
      );
      this.log.warn(
        `Reuso de refresh token detectado para o usuario ${resultado.usuarioId}. ` +
          'Todas as sessoes foram revogadas.',
      );
      throw new UnauthorizedException('Sessao invalida.');
    }

    return resultado.tokens;
  }

  async encerrar(refreshToken: string): Promise<void> {
    const hash = oHash(refreshToken);
    await this.db.comoSistema('logout', (trx) =>
      trx
        .updateTable('sessoes')
        .set({ revogada_em: new Date(), motivo_revogacao: 'logout' })
        .where('token_hash', '=', hash)
        .where('revogada_em', 'is', null)
        .execute(),
    );
  }

  async encerrarTodas(usuarioId: string): Promise<void> {
    await this.db.comoSistema('logout de todas as sessoes', (trx) =>
      this.revogarTodasAsSessoes(trx, usuarioId, 'logout global'),
    );
  }

  verificarAccessToken(token: string): ClaimsDoToken {
    try {
      return this.jwt.verify<ClaimsDoToken>(token);
    } catch {
      throw new UnauthorizedException('Token invalido ou expirado.');
    }
  }

  // ── internos ───────────────────────────────────────────────────────────────

  /**
   * Retorna `bloqueado` (true = inadimplente, mas pode logar) ou lanca excecao
   * para os status que nao admitem autoatendimento (suspenso, cancelado).
   */
  private async verificarTenantPodeLogar(trx: Trx, tenantId: string | null): Promise<boolean> {
    // Superadmin nao pertence a tenant nenhum.
    if (!tenantId) return false;

    const tenant = await trx
      .selectFrom('tenants')
      .select(['status'])
      .where('id', '=', tenantId)
      .executeTakeFirst();

    if (!tenant) throw new UnauthorizedException('E-mail ou senha invalidos.');

    const status = tenant.status as StatusTenant;
    if (!STATUS_QUE_PODE_LOGAR.includes(status)) {
      // Mensagem explicita: aqui o usuario precisa saber o que aconteceu,
      // diferente do login por senha errada, onde vagueza e proposital.
      throw new ForbiddenException(
        status === 'suspenso'
          ? 'Esta conta foi suspensa. Fale com o suporte para reativar.'
          : 'Esta conta foi cancelada.',
      );
    }

    return status === 'inadimplente';
  }

  private async emitirTokens(
    trx: Trx,
    dados: {
      usuarioId: string;
      tenantId: string | null;
      lojaId: string | null;
      papel: PapelUsuario;
      bloqueado: boolean;
      userAgent: string | null;
      ip: string | null;
    },
  ): Promise<ParDeTokens & { sessaoId: string }> {
    const claims: ClaimsDoToken = {
      sub: dados.usuarioId,
      tid: dados.tenantId,
      papel: dados.papel,
      lid: dados.lojaId,
      bloqueado: dados.bloqueado,
    };

    const accessToken = await this.jwt.signAsync(claims);

    // 32 bytes de entropia. O token em claro so existe na resposta HTTP.
    const refreshToken = randomBytes(32).toString('base64url');
    const expiraEm = new Date(Date.now() + env.REFRESH_TOKEN_DIAS * 24 * 60 * 60 * 1000);

    const sessao = await trx
      .insertInto('sessoes')
      .values({
        usuario_id: dados.usuarioId,
        tenant_id: dados.tenantId,
        token_hash: oHash(refreshToken),
        expira_em: expiraEm,
        user_agent: dados.userAgent,
        ip: dados.ip,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    return {
      accessToken,
      refreshToken,
      expiraEm: env.ACCESS_TOKEN_MINUTOS * 60,
      sessaoId: sessao.id,
    };
  }

  private async revogarTodasAsSessoes(trx: Trx, usuarioId: string, motivo: string) {
    await trx
      .updateTable('sessoes')
      .set({ revogada_em: new Date(), motivo_revogacao: motivo })
      .where('usuario_id', '=', usuarioId)
      .where('revogada_em', 'is', null)
      .execute();
  }

  static async gerarHashDeSenha(senha: string): Promise<string> {
    return argon2.hash(senha, ARGON2);
  }
}
