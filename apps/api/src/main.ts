import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { env } from './config/env.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableShutdownHooks();

  await app.listen(env.PORT);
  new Logger('Bootstrap').log(`Rotulei API em http://localhost:${env.PORT}/api`);
}

bootstrap();
