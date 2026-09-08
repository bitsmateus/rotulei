import { BadRequestException, Injectable } from '@nestjs/common';
import { ContextoDbService } from '../../database/contexto-db.service.js';
import { CryptoService } from '../../common/crypto/crypto.service.js';
import { AsaasCliente } from '../asaas/asaas.cliente.js';
import type { CredenciaisAsaas } from '../asaas/asaas.tipos.js';
import type { SalvarAsaasConfigDto } from './config-plataforma.dto.js';

const CHAVE_ASAAS = 'asaas';

export interface StatusAsaas {
  configurado: boolean;
  ambiente?: 'sandbox' | 'production';
  /** So os ultimos 4 caracteres. O valor inteiro nunca volta pela API. */
  dica?: string | null;
  atualizadoEm?: Date;
}

/**
 * Credenciais do Asaas cadastradas pelo superadmin (DECISOES.md #17).
 *
 * Duas portas de entrada bem separadas:
 *  - `obterStatus`/`salvar`: chamadas pelo controller do superadmin, na
 *    identidade de quem fez a request (que ja e global — superadmin passa
 *    `app_e_global()`).
 *  - `obterCredenciais`: uso INTERNO por qualquer servico que precise montar
 *    um AsaasCliente (checkout de um tenant, webhook). Le via `comoSistema`
 *    de proposito: a credencial do gateway e config de plataforma, nao dado
 *    de tenant — nenhum tenant deveria ter visibilidade de RLS sobre ela, mas
 *    o SERVICO usa em nome da request para falar com o Asaas. Nunca expor
 *    o retorno deste metodo por um controller.
 */
@Injectable()
export class ConfigPlataformaService {
  constructor(
    private readonly db: ContextoDbService,
    private readonly crypto: CryptoService,
  ) {}

  async obterStatus(): Promise<StatusAsaas> {
    const linha = await this.db.comContextoDoRequest((trx) =>
      trx
        .selectFrom('config_plataforma')
        .select(['ambiente', 'credencial_dica', 'atualizado_em'])
        .where('chave', '=', CHAVE_ASAAS)
        .executeTakeFirst(),
    );

    if (!linha) return { configurado: false };
    return {
      configurado: true,
      ambiente: linha.ambiente as 'sandbox' | 'production',
      dica: linha.credencial_dica,
      atualizadoEm: linha.atualizado_em,
    };
  }

  /**
   * Salva a credencial e devolve se ela realmente funciona. NAO bloqueia o
   * salvamento se a conexao falhar — o superadmin pode estar cadastrando a
   * chave antes de ativar o ambiente no Asaas, por exemplo — mas o aviso
   * aparece na hora, em vez de so quando um tenant tentar pagar.
   */
  async salvar(dto: SalvarAsaasConfigDto, usuarioId: string): Promise<{ conexaoOk: boolean }> {
    const existente = await this.db.comContextoDoRequest((trx) =>
      trx
        .selectFrom('config_plataforma')
        .select(['credenciais_cifradas'])
        .where('chave', '=', CHAVE_ASAAS)
        .executeTakeFirst(),
    );

    let apiKey = dto.apiKey?.trim();
    let webhookToken = dto.webhookToken?.trim();

    // Campo em branco na edicao = manter o valor atual (o painel avisa isso).
    if (!apiKey) {
      if (!existente) throw new BadRequestException('Informe a API Key do Asaas.');
      const atual = this.crypto.decifrarJson<CredenciaisAsaas>(existente.credenciais_cifradas);
      apiKey = atual.apiKey;
      if (webhookToken === undefined) webhookToken = atual.webhookToken;
    }

    const credenciais: CredenciaisAsaas = { apiKey, webhookToken, ambiente: dto.ambiente };
    const cifradas = this.crypto.cifrarJson(credenciais);
    const dica = apiKey.slice(-4);

    await this.db.comContextoDoRequest((trx) =>
      trx
        .insertInto('config_plataforma')
        .values({
          chave: CHAVE_ASAAS,
          ambiente: dto.ambiente,
          credenciais_cifradas: cifradas,
          credencial_dica: dica,
          atualizado_por: usuarioId,
        })
        .onConflict((oc) =>
          oc.column('chave').doUpdateSet({
            ambiente: dto.ambiente,
            credenciais_cifradas: cifradas,
            credencial_dica: dica,
            atualizado_por: usuarioId,
          }),
        )
        .execute(),
    );

    const conexaoOk = await new AsaasCliente(credenciais)
      .testarConexao()
      .then(() => true)
      .catch(() => false);

    return { conexaoOk };
  }

  /** ⚠️ Uso interno — nunca exponha o retorno via controller. */
  async obterCredenciais(): Promise<CredenciaisAsaas> {
    const linha = await this.db.comoSistema('ler credenciais do Asaas', (trx) =>
      trx
        .selectFrom('config_plataforma')
        .select(['ambiente', 'credenciais_cifradas'])
        .where('chave', '=', CHAVE_ASAAS)
        .executeTakeFirst(),
    );

    if (!linha) {
      throw new BadRequestException(
        'O Asaas ainda nao foi configurado. Peça ao superadmin para cadastrar a chave.',
      );
    }

    const credenciais = this.crypto.decifrarJson<CredenciaisAsaas>(linha.credenciais_cifradas);
    credenciais.ambiente = linha.ambiente as 'sandbox' | 'production';
    return credenciais;
  }

  /** Monta o client pronto para uso — atalho para quem so quer chamar o Asaas. */
  async obterCliente(): Promise<AsaasCliente> {
    return new AsaasCliente(await this.obterCredenciais());
  }
}
