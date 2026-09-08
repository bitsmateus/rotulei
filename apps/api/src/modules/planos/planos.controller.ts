import { Controller, Get } from '@nestjs/common';
import { Publico } from '../../common/decorators/publico.decorator.js';
import { PlanosService } from './planos.service.js';

@Controller('planos')
export class PlanosController {
  constructor(private readonly planos: PlanosService) {}

  /** Rota publica: alimenta a tela de escolha de plano no cadastro. */
  @Publico()
  @Get()
  listar() {
    return this.planos.listarPublicos();
  }
}
