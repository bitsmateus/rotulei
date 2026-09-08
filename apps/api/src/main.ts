import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { env } from './config/env.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });

  // Acesso direto nao confia em X-Forwarded-For enviado pelo visitante.
  // No deploy, configure a quantidade exata de proxies confiaveis e mantenha
  // a API inacessivel por caminhos que contornem esses proxies.
  app.set('trust proxy', env.TRUST_PROXY_HOPS || false);
  app.disable('x-powered-by');
  app.use((_req: unknown, res: { setHeader: (name: string, value: string) => void }, next: () => void) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableShutdownHooks();

  // Default do Express e 100kb — pequeno demais para o logo em base64 (item
  // 7, marca propria). O teto de verdade fica no DTO (MarcaDto); isto so
  // evita que o body-parser rejeite antes da validacao rodar.
  app.useBodyParser('json', { limit: '1mb' });

  await app.listen(env.PORT);
  new Logger('Bootstrap').log(`Rotulei API em http://localhost:${env.PORT}/api`);
}

bootstrap();
