import { SetMetadata } from '@nestjs/common';

export const CHAVE_PERMITE_BLOQUEADO = 'rotulei:permite-quando-bloqueado';

/**
 * Libera a rota mesmo com o tenant inadimplente (Opcao B — DECISOES.md #18).
 *
 * Sem isto, o BloqueioInadimplenciaGuard recusa toda rota de negocio para um
 * tenant sem acesso. As excecoes sao as rotas que o proprio fluxo de
 * desbloqueio precisa: ver a propria sessao, sair, e o checkout de assinatura.
 */
export const PermiteQuandoBloqueado = () => SetMetadata(CHAVE_PERMITE_BLOQUEADO, true);
