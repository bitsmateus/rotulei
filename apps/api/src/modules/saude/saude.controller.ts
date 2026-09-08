import { Controller, Get } from '@nestjs/common';
import { Publico } from '../../common/decorators/publico.decorator.js';
import { sql } from 'kysely';
import { ContextoDbService } from '../../database/contexto-db.service.js';

@Controller('saude')
export class SaudeController {
  constructor(private readonly db: ContextoDbService) {}

  @Publico()
  @Get()
  async verificar() {
    const info = await this.db.comoAnonimo(async (trx) => {
      const { rows } = await sql<{
        role: string;
        banco: string;
        agora: Date;
      }>`select current_user as role, current_database() as banco, now() as agora`.execute(trx);
      return rows[0];
    });

    return {
      status: 'ok',
      agora: info.agora,
    };
  }
}
