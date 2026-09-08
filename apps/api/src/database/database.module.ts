import { Global, Logger, Module, type OnModuleDestroy } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import type { Pool } from 'pg';
import { Kysely } from 'kysely';
import { env } from '../config/env.js';
import { criarKysely, criarPool, verificarRoleSegura } from './pool.js';
import { ContextoDbService } from './contexto-db.service.js';
import { KYSELY, PG_POOL } from './tokens.js';
import type { DB } from './tipos.js';

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: async (): Promise<Pool> => {
        const pool = criarPool(env.DATABASE_URL, env.DATABASE_POOL_MAX);
        const role = await verificarRoleSegura(pool);
        new Logger('Database').log(`conectado como "${role}" (RLS ativo)`);
        return pool;
      },
    },
    {
      provide: KYSELY,
      inject: [PG_POOL],
      useFactory: (pool: Pool) => criarKysely(pool),
    },
    ContextoDbService,
  ],
  exports: [ContextoDbService, KYSELY, PG_POOL],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(@Inject(KYSELY) private readonly db: Kysely<DB>) {}

  async onModuleDestroy() {
    await this.db.destroy();
  }
}
