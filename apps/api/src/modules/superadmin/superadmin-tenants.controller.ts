import { Body, Controller, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { SuperadminTenantsService } from './superadmin-tenants.service.js';
import { AlterarStatusTenantDto } from './superadmin-tenants.dto.js';
import { Papeis } from '../../common/decorators/papeis.decorator.js';

/** ESCOPO.md, secao Superadmin: lista de tenants, MRR, suspender/reativar. */
@Papeis('superadmin')
@Controller('admin')
export class SuperadminTenantsController {
  constructor(private readonly service: SuperadminTenantsService) {}

  @Get('tenants')
  listar() {
    return this.service.listar();
  }

  @Get('metricas')
  metricas() {
    return this.service.metricas();
  }

  @Patch('tenants/:id/status')
  alterarStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AlterarStatusTenantDto) {
    return this.service.alterarStatus(id, dto.status);
  }
}
