import { AsyncLocalStorage } from 'node:async_hooks';
import type { PapelContexto } from '@rotulei/shared';

/**
 * Quem esta falando com o banco nesta transacao.
 *
 * `papel: null` = anonimo (ex.: pagina publica de cadastro lendo o catalogo de
 * planos). Nao e um estado de erro — e um contexto que so enxerga o que as
 * politicas liberam sem tenant nenhum.
 */
export interface ContextoSessao {
  tenantId: string | null;
  usuarioId: string | null;
  papel: PapelContexto | null;
}

export const CONTEXTO_ANONIMO: ContextoSessao = {
  tenantId: null,
  usuarioId: null,
  papel: null,
};

/**
 * Contexto propagado por request sem precisar passar parametro por toda a
 * cadeia de servicos. Preenchido pelo guard de auth no item 3.
 */
export const armazenamentoDeContexto = new AsyncLocalStorage<ContextoSessao>();

export function contextoAtual(): ContextoSessao {
  return armazenamentoDeContexto.getStore() ?? CONTEXTO_ANONIMO;
}
