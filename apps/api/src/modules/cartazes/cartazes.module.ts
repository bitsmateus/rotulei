import { Module } from '@nestjs/common';
import { CartazesController } from './cartazes.controller.js';
import { CartazesService } from './cartazes.service.js';

@Module({
  controllers: [CartazesController],
  providers: [CartazesService],
})
export class CartazesModule {}
