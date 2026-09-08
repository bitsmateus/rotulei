import { Module } from '@nestjs/common';
import { AssinaturaController } from './assinatura.controller.js';
import { AssinaturaService } from './assinatura.service.js';
import { ConfigPlataformaModule } from '../config-plataforma/config-plataforma.module.js';

@Module({
  imports: [ConfigPlataformaModule],
  controllers: [AssinaturaController],
  providers: [AssinaturaService],
})
export class AssinaturaModule {}
