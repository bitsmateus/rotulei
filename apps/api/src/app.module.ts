import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { AuthGuard } from './common/guards/auth.guard.js';
import { LimitePorIpGuard } from './common/guards/limite-por-ip.guard.js';
import { SaudeModule } from './modules/saude/saude.module.js';
import { PlanosModule } from './modules/planos/planos.module.js';
import { CartazesModule } from './modules/cartazes/cartazes.module.js';
import { CadastroPublicoModule } from './modules/cadastro-publico/cadastro-publico.module.js';
import { ConfigPlataformaModule } from './modules/config-plataforma/config-plataforma.module.js';
import { AsaasModule } from './modules/asaas/asaas.module.js';
import { AssinaturaModule } from './modules/assinatura/assinatura.module.js';
import { TrialModule } from './modules/trial/trial.module.js';
import { SuperadminModule } from './modules/superadmin/superadmin.module.js';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    DatabaseModule,
    AuthModule,
    SaudeModule,
    PlanosModule,
    CartazesModule,
    CadastroPublicoModule,
    ConfigPlataformaModule,
    AsaasModule,
    AssinaturaModule,
    TrialModule,
    SuperadminModule,
  ],
  providers: [
    // Ordem importa: o limite por IP roda ANTES da autenticacao, pra rejeitar
    // trafego abusivo sem gastar verificacao de JWT nem ida ao banco. E um
    // no-op para toda rota sem @LimitarPorIp() — hoje, so o cadastro publico.
    { provide: APP_GUARD, useClass: LimitePorIpGuard },
    // Guard GLOBAL: toda rota nasce protegida. Para abrir uma, escreva
    // @Publico() nela — o contrario (proteger uma a uma) esquece rota.
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
