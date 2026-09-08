import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { env } from '../../config/env.js';

@Global()
@Module({
  imports: [
    JwtModule.register({
      secret: env.JWT_SECRET,
      signOptions: {
        expiresIn: `${env.ACCESS_TOKEN_MINUTOS}m`,
        issuer: 'rotulei',
      },
      verifyOptions: { issuer: 'rotulei' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
