import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ContextoDbService } from '../../database/contexto-db.service.js';

/**
 * Fim do trial — Opcao B (DECISOES.md #18).
 *
 * Nao existe evento externo que dispare isso: e o relogio. Todo dia de manha,
 * varre tenants em trial cujo prazo venceu e vira `inadimplente`. O acesso
 * fecha (STATUS_COM_ACESSO nao inclui 'inadimplente'), mas o LOGIN continua
 * funcionando (STATUS_QUE_PODE_LOGAR inclui) — o admin entra, ve a tela de
 * cobranca e desbloqueia pagando.
 */
@Injectable()
export class TrialService implements OnApplicationBootstrap {
  private readonly log = new Logger(TrialService.name);

  constructor(private readonly db: ContextoDbService) {}

  /**
   * Roda tambem na subida do container, sem esperar o horario do @Cron — um
   * restart nao pode deixar um trial vencido de pe ate o dia seguinte.
   */
  async onApplicationBootstrap() {
    await this.encerrarTriaisVencidos();
  }

  @Cron('0 6 * * *', { timeZone: 'America/Sao_Paulo' })
  async encerrarTriaisVencidos() {
    try {
      const afetados = await this.db.comoSistema('fim de trial', (trx) =>
        trx
          .updateTable('tenants')
          .set({ status: 'inadimplente' })
          .where('status', '=', 'trial')
          .where('trial_termina_em', '<', new Date())
          .returning('id')
          .execute(),
      );

      if (afetados.length > 0) {
        this.log.log(`${afetados.length} trial(s) vencido(s) -> inadimplente.`);
      }
    } catch (erro) {
      // Um job agendado que lanca excecao sem captura derruba o processo do
      // Nest inteiro (uncaught rejection) — os outros crons parariam junto.
      this.log.error(`Falha ao encerrar trials vencidos: ${String(erro)}`);
    }
  }
}
