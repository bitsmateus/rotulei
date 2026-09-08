import { Module } from '@nestjs/common';
import { ConfigPlataformaController } from './config-plataforma.controller.js';
import { ConfigPlataformaService } from './config-plataforma.service.js';
import { CryptoService } from '../../common/crypto/crypto.service.js';

@Module({
  controllers: [ConfigPlataformaController],
  providers: [ConfigPlataformaService, CryptoService],
  exports: [ConfigPlataformaService],
})
export class ConfigPlataformaModule {}
