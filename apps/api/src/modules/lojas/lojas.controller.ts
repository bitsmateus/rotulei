import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { LojasService } from './lojas.service.js';
import { CriarLojaDto, EditarLojaDto } from './lojas.dto.js';
import { Papeis } from '../../common/decorators/papeis.decorator.js';
import { UsuarioAtual, type UsuarioAutenticado } from '../../common/decorators/usuario-atual.decorator.js';

/** Cadastro de lojas do tenant (item 7, ESCOPO.md) — so o admin do tenant mexe. */
@Papeis('admin')
@Controller('tenant/lojas')
export class LojasController {
  constructor(private readonly lojas: LojasService) {}

  @Get()
  listar() {
    return this.lojas.listar();
  }

  @Post()
  criar(@Body() dto: CriarLojaDto, @UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.lojas.criar(dto, usuario);
  }

  @Patch(':id')
  editar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EditarLojaDto) {
    return this.lojas.editar(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remover(@Param('id', ParseUUIDPipe) id: string) {
    return this.lojas.remover(id);
  }
}
