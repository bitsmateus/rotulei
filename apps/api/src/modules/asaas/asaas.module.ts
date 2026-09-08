import { Module } from '@nestjs/common';
import { AsaasWebhookController } from './asaas-webhook.controller.js';
import { AsaasWebhookService } from './asaas-webhook.service.js';
import { ConfigPlataformaModule } from '../config-plataforma/config-plataforma.module.js';

@Module({
  imports: [ConfigPlataformaModule],
  controllers: [AsaasWebhookController],
  providers: [AsaasWebhookService],
})
export class AsaasModule {}
