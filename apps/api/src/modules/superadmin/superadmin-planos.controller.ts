import { Body, Controller, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { SuperadminPlanosService } from './superadmin-planos.service.js';
import { EditarPlanoDto } from './superadmin-planos.dto.js';
import { Papeis } from '../../common/decorators/papeis.decorator.js';

/**
 * Diferente de PlanosController (publico, so ativos): aqui o superadmin ve e
 * edita todos os planos, inclusive inativos.
 */
@Papeis('superadmin')
@Controller('admin/planos')
export class SuperadminPlanosController {
  constructor(private readonly service: SuperadminPlanosService) {}

  @Get()
  listar() {
    return this.service.listar();
  }

  @Patch(':id')
  editar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EditarPlanoDto) {
    return this.service.editar(id, dto);
  }
}
