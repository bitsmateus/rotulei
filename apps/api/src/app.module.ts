import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { AuthGuard } from './common/guards/auth.guard.js';
import { SaudeModule } from './modules/saude/saude.module.js';
import { PlanosModule } from './modules/planos/planos.module.js';
import { CartazesModule } from './modules/cartazes/cartazes.module.js';

@Module({
  imports: [DatabaseModule, AuthModule, SaudeModule, PlanosModule, CartazesModule],
  providers: [
    // Guard GLOBAL: toda rota nasce protegida. Para abrir uma, escreva
    // @Publico() nela — o contrario (proteger uma a uma) esquece rota.
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
