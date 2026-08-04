import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

/**
 * Démarre l'application NestJS FGT Launch Control Tower.
 * Configure le CORS, la validation globale des entrées et l'écoute HTTP sur le port défini.
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const port = Number(process.env.PORT || 8000);
  await app.listen(port, '0.0.0.0');
  console.log(`FGT Launch Control Tower (NestJS) → http://0.0.0.0:${port}`);
}
bootstrap();
