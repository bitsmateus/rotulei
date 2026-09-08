import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { UsuariosService } from './usuarios.service.js';
import { CriarUsuarioDto, EditarUsuarioDto } from './usuarios.dto.js';
import { Papeis } from '../../common/decorators/papeis.decorator.js';
import { UsuarioAtual, type UsuarioAutenticado } from '../../common/decorators/usuario-atual.decorator.js';

/** Cadastro de usuarios (admins e operadores) do tenant (item 7, ESCOPO.md). */
@Papeis('admin')
@Controller('tenant/usuarios')
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

  @Get()
  listar() {
    return this.usuarios.listar();
  }

  @Post()
  criar(@Body() dto: CriarUsuarioDto, @UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.usuarios.criar(dto, usuario);
  }

  @Patch(':id')
  editar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditarUsuarioDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.usuarios.editar(id, dto, usuario);
  }

  @Delete(':id')
  @HttpCode(204)
  remover(@Param('id', ParseUUIDPipe) id: string, @UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.usuarios.remover(id, usuario);
  }
}
