import { Body, Controller, Get, Put } from '@nestjs/common';
import { MarcaService } from './marca.service.js';
import { EditarMarcaDto } from './marca.dto.js';
import { Papeis } from '../../common/decorators/papeis.decorator.js';
import { UsuarioAtual, type UsuarioAutenticado } from '../../common/decorators/usuario-atual.decorator.js';

/**
 * Marca propria do tenant (item 7). Leitura sem @Papeis(): o operador tambem
 * precisa do logo para o cartaz dele mostrar a marca certa. Escrita e so do
 * admin — mesmo espirito de lojas/usuarios.
 */
@Controller('tenant/marca')
export class MarcaController {
  constructor(private readonly marca: MarcaService) {}

  @Get()
  obter(@UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.marca.obter(usuario);
  }

  @Put()
  @Papeis('admin')
  editar(@Body() dto: EditarMarcaDto, @UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.marca.editar(dto, usuario);
  }
}
