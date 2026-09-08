import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { env } from './config/env.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });

  // Atras do nginx do container web (que faz proxy de /api para ca) e do
  // Traefik do EasyPanel na frente dele: sem isto, `req.ip` seria sempre o IP
  // do proxy, nao do visitante — e o rate limiting por IP (LimitePorIpGuard)
  // acabaria valendo para todo mundo junto, em vez de pessoa por pessoa.
  app.set('trust proxy', 1);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableShutdownHooks();

  await app.listen(env.PORT);
  new Logger('Bootstrap').log(`Rotulei API em http://localhost:${env.PORT}/api`);
}

bootstrap();
