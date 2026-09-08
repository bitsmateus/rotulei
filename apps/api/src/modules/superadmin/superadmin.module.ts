import { Module } from '@nestjs/common';
import { SuperadminTenantsController } from './superadmin-tenants.controller.js';
import { SuperadminTenantsService } from './superadmin-tenants.service.js';
import { SuperadminPlanosController } from './superadmin-planos.controller.js';
import { SuperadminPlanosService } from './superadmin-planos.service.js';

@Module({
  controllers: [SuperadminTenantsController, SuperadminPlanosController],
  providers: [SuperadminTenantsService, SuperadminPlanosService],
})
export class SuperadminModule {}
