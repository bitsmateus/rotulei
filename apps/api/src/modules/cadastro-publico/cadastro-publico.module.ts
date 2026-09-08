import { Module } from '@nestjs/common';
import { CadastroPublicoController } from './cadastro-publico.controller.js';
import { CadastroPublicoService } from './cadastro-publico.service.js';

@Module({
  controllers: [CadastroPublicoController],
  providers: [CadastroPublicoService],
})
export class CadastroPublicoModule {}
