import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PapelUsuario } from '@rotulei/shared';
import { AuthService } from '../../modules/auth/auth.service.js';
import { CHAVE_PUBLICO } from '../decorators/publico.decorator.js';
import { CHAVE_PAPEIS } from '../decorators/papeis.decorator.js';
import { CHAVE_PERMITE_BLOQUEADO } from '../decorators/permite-quando-bloqueado.decorator.js';
import { armazenamentoDeContexto } from '../../database/contexto.js';
import type { UsuarioAutenticado } from '../decorators/usuario-atual.decorator.js';
import { TenantBloqueadoException } from '../excecoes/tenant-bloqueado.exception.js';

/**
 * Guard global: valida o token, monta o contexto de sessao e confere o papel.
 *
 * O ponto mais importante daqui: o `tenant_id` que vai para o banco vem SEMPRE
 * do JWT assinado, nunca de um header, query ou body. Se viesse do request, um
 * cliente poderia escolher o proprio tenant e o RLS obedeceria — as politicas
 * confiam no contexto, e o contexto e montado aqui.
 *
 * O papel 'sistema' NUNCA e emitido em JWT: nao existe token capaz de virar
 * contexto cross-tenant. Esse caminho so existe em codigo, via
 * ContextoDbService.comoSistema().
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const alvos = [contexto.getHandler(), contexto.getClass()];
    const ehPublico = this.reflector.getAllAndOverride<boolean>(CHAVE_PUBLICO, alvos);
    const req = contexto.switchToHttp().getRequest();

    if (ehPublico) {
      // Rota publica roda sem tenant e sem papel: o RLS so libera o que for
      // explicitamente publico (hoje, o catalogo de planos).
      return this.executarCom(
        { tenantId: null, usuarioId: null, papel: null },
        contexto,
        () => true,
      );
    }

    const token = extrairToken(req);
    if (!token) throw new UnauthorizedException('Token nao informado.');

    const claims = this.auth.verificarAccessToken(token);

    const papeisPermitidos = this.reflector.getAllAndOverride<PapelUsuario[]>(
      CHAVE_PAPEIS,
      alvos,
    );
    if (papeisPermitidos?.length && !papeisPermitidos.includes(claims.papel)) {
      throw new ForbiddenException('Seu papel nao tem acesso a esta operacao.');
    }

    /*
     * Tenant inadimplente (Opcao B — DECISOES.md #18): o login foi permitido de
     * proposito para o admin conseguir pagar, mas toda rota de negocio fica
     * fechada ate a conta voltar a 'ativo'. As excecoes sao marcadas com
     * @PermiteQuandoBloqueado() — hoje, /auth/* e o checkout da assinatura.
     */
    const permiteBloqueado = this.reflector.getAllAndOverride<boolean>(
      CHAVE_PERMITE_BLOQUEADO,
      alvos,
    );
    if (claims.bloqueado && !permiteBloqueado) {
      throw new TenantBloqueadoException();
    }

    const usuario: UsuarioAutenticado = {
      id: claims.sub,
      tenantId: claims.tid,
      lojaId: claims.lid,
      papel: claims.papel,
      bloqueado: claims.bloqueado,
    };
    req.usuario = usuario;

    return this.executarCom(
      { tenantId: claims.tid, usuarioId: claims.sub, papel: claims.papel },
      contexto,
      () => true,
    );
  }

  /**
   * Ancora o AsyncLocalStorage no request.
   *
   * `enterWith` (em vez de `run`) e usado porque o guard precisa devolver o
   * controle ao Nest e o contexto tem de sobreviver ate o fim do handler. Como
   * o Nest atende cada request numa cadeia assincrona propria, o contexto nao
   * vaza entre requests — e, ainda que vazasse, o ContextoDbService reescreve
   * os tres GUCs no inicio de toda transacao.
   */
  private executarCom<T>(
    ctx: { tenantId: string | null; usuarioId: string | null; papel: PapelUsuario | null },
    _contexto: ExecutionContext,
    fn: () => T,
  ): T {
    armazenamentoDeContexto.enterWith(ctx);
    return fn();
  }
}

function extrairToken(req: { headers?: Record<string, unknown> }): string | null {
  const cabecalho = req.headers?.authorization;
  if (typeof cabecalho !== 'string') return null;
  const [tipo, valor] = cabecalho.split(' ');
  return tipo?.toLowerCase() === 'bearer' && valor ? valor : null;
}
