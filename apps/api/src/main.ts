import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { mkdirSync } from 'fs';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;
  const corsOrigin = process.env.CORS_ORIGIN?.split(',') ?? [
    'http://localhost:3000',
  ];

  // crossOriginResourcePolicy: cross-origin lets the web app (a different
  // origin) embed uploaded article images served from /uploads.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(compression());

  // Uploaded article images live under ./uploads and are served at /uploads.
  const uploadsDir = join(process.cwd(), 'uploads');
  mkdirSync(uploadsDir, { recursive: true });
  app.useStaticAssets(uploadsDir, { prefix: '/uploads/' });

  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableShutdownHooks();

  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`🚀 GeoWatch API running on http://0.0.0.0:${port}/api`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('❌ Failed to start application', err);
  process.exit(1);
});
