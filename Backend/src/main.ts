import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
    bodyParser: true,
  });

  // Cookie parser for future cookie-based refresh token support
  app.use(cookieParser());

  // CORS configuration
  const rawOrigins = process.env.CORS_ORIGINS?.split(',').map((o) => o.trim()) ?? [];
  app.enableCors({
    origin: rawOrigins.length > 0 ? rawOrigins : false,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-active-role', 'x-request-id'],
  });

  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port);

  console.log(`SUUQZO MALL Backend running on port ${port}`);
}

bootstrap().catch((err) => {
  console.error('Fatal error during startup:', err);
  process.exit(1);
});
