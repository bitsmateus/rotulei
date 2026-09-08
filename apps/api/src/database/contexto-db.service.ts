import { Inject, Injectable } from '@nestjs/common';
import { Kysely, Transaction, sql } from 'kysely';
import type { DB } from './tipos.js';
import { KYSELY } from './tokens.js';
import { CONTEXTO_ANONIMO, contextoAtual, type ContextoSessao } from './contexto.js';

export type Trx = Transaction<DB>;

/**
 * Ponto unico de acesso ao banco.
 *
 * TODA query passa por aqui, dentro de uma transacao que carrega o contexto de
 * sessao (`app.tenant_id`, `app.usuario_id`, `app.papel`). Isso nao e cerimonia:
 * `set_config(..., true)` so vale dentro de transacao. Uma query solta fora
 * daqui roda sem contexto e, pelas politicas de RLS, nao ve linha nenhuma.
 *
 * Nao exponha o Kysely cru para os modulos de dominio.
 */
@Injectable()
export class ContextoDbService {
  constructor(@Inject(KYSELY) private readonly db: Kysely<DB>) {}

  /** Executa `fn` com o contexto informado. */
  async comContexto<T>(contexto: ContextoSessao, fn: (trx: Trx) => Promise<T>): Promise<T> {
    return this.db.transaction().execute(async (trx) => {
      // Os tres sao setados sempre, inclusive vazios: alem de definir o
      // contexto atual, isso LIMPA qualquer valor residual da conexao do pool.
      await sql`select
        set_config('app.tenant_id',  ${contexto.tenantId ?? ''},  true),
        set_config('app.usuario_id', ${contexto.usuarioId ?? ''}, true),
        set_config('app.papel',      ${contexto.papel ?? ''},     true)`.execute(trx);

      return fn(trx);
    });
  }

  /** Contexto do request atual (preenchido pelo guard de auth — item 3). */
  async comContextoDoRequest<T>(fn: (trx: Trx) => Promise<T>): Promise<T> {
    return this.comContexto(contextoAtual(), fn);
  }

  /** Sem tenant e sem papel: so enxerga o que e publico (ex.: catalogo de planos). */
  async comoAnonimo<T>(fn: (trx: Trx) => Promise<T>): Promise<T> {
    return this.comContexto(CONTEXTO_ANONIMO, fn);
  }

  /**
   * ⚠️ CAMINHO CROSS-TENANT. Enxerga e escreve em TODOS os tenants.
   *
   * Legitimo apenas para: webhooks do gateway (Asaas), cadastro publico criando
   * tenant e jobs de manutencao. Nunca chame a partir de uma rota autenticada
   * por JWT de usuario — para superadmin existe o papel 'superadmin', que passa
   * pelo guard normal.
   *
   * @param motivo texto curto que vai pro log — serve de trilha de auditoria.
   */
  async comoSistema<T>(motivo: string, fn: (trx: Trx) => Promise<T>): Promise<T> {
    return this.comContexto(
      { tenantId: null, usuarioId: null, papel: 'sistema' },
      async (trx) => {
        void motivo;
        return fn(trx);
      },
    );
  }
}
