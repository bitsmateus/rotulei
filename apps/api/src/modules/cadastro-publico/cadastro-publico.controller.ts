import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CadastroPublicoService } from './cadastro-publico.service.js';
import { CadastroPublicoDto } from './cadastro-publico.dto.js';
import { Publico } from '../../common/decorators/publico.decorator.js';

@Controller('public')
export class CadastroPublicoController {
  constructor(private readonly cadastro: CadastroPublicoService) {}

  /**
   * Cadastro publico: cria tenant + admin em trial, sem cartao (ESCOPO.md).
   * Ja devolve os tokens — o admin entra direto, sem precisar logar de novo.
   */
  @Publico()
  @Post('cadastro')
  @HttpCode(201)
  cadastrar(@Body() dto: CadastroPublicoDto) {
    return this.cadastro.cadastrar(dto);
  }
}
