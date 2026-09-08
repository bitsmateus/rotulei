import { Module } from '@nestjs/common';
import { MarcaController } from './marca.controller.js';
import { MarcaService } from './marca.service.js';

@Module({
  controllers: [MarcaController],
  providers: [MarcaService],
})
export class MarcaModule {}
