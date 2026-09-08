import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { AsaasWebhookService } from './asaas-webhook.service.js';
import { Publico } from '../../common/decorators/publico.decorator.js';

/**
 * Webhook do Asaas da plataforma. Publico — a autenticidade nao vem de sessao
 * nenhuma, e sim da reconsulta a API (ver AsaasWebhookService). Configure esta
 * URL no painel do Asaas: POST {API}/webhooks/asaas
 */
@Controller('webhooks')
export class AsaasWebhookController {
  constructor(private readonly webhook: AsaasWebhookService) {}

  @Publico()
  @Post('asaas')
  @HttpCode(200)
  receber(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() corpo: unknown,
  ) {
    return this.webhook.processar(headers, corpo);
  }
}
