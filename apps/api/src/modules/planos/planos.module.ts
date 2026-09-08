import { Module } from '@nestjs/common';
import { PlanosController } from './planos.controller.js';
import { PlanosService } from './planos.service.js';

@Module({
  controllers: [PlanosController],
  providers: [PlanosService],
  exports: [PlanosService],
})
export class PlanosModule {}
