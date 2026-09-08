import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CartazesService } from './cartazes.service.js';
import { CartazDto } from './cartazes.dto.js';
import {
  UsuarioAtual,
  type UsuarioAutenticado,
} from '../../common/decorators/usuario-atual.decorator.js';

/**
 * Cartazes do tenant autenticado.
 *
 * Sem @Papeis(): operador tambem cria e imprime — e o trabalho dele na gondola.
 * O que o operador nao pode e mexer em loja, usuario ou cobranca.
 */
@Controller('tenant/cartazes')
export class CartazesController {
  constructor(private readonly cartazes: CartazesService) {}

  @Get()
  listar(@Query('limite') limite?: string) {
    return this.cartazes.listar(limite ? Number(limite) : undefined);
  }

  @Get(':id')
  buscar(@Param('id', ParseUUIDPipe) id: string) {
    return this.cartazes.buscar(id);
  }

  @Post()
  criar(@Body() dto: CartazDto, @UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.cartazes.criar(dto, usuario);
  }

  @Put(':id')
  atualizar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CartazDto) {
    return this.cartazes.atualizar(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remover(@Param('id', ParseUUIDPipe) id: string) {
    return this.cartazes.remover(id);
  }
}
