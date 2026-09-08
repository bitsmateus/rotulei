import { IsIn } from 'class-validator';
import { STATUS_TENANT, type StatusTenant } from '@rotulei/shared';

export class AlterarStatusTenantDto {
  @IsIn(STATUS_TENANT)
  status!: StatusTenant;
}
