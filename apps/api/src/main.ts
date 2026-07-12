import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  // rawBody keeps the exact request bytes for webhook HMAC verification
  // (Razorpay signs the raw payload, not the parsed object).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  // Onboarding imports upload whole Tally XML / XLSX files as base64 JSON.
  app.useBodyParser('json', { limit: '40mb' });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Behind nginx the client IP arrives in X-Forwarded-For — trust exactly
  // one proxy hop so rate limiting tracks real clients, not the proxy.
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cookieParser());

  // CORS allowlist: the web origin, any operator-configured extras, and the
  // fixed origins the native shells (Capacitor/Tauri/Electron-on-localhost)
  // present. Requests with no Origin header (native HTTP, server-to-server,
  // curl) are allowed through; unknown browser origins are rejected.
  const allowedOrigins = new Set(
    [
      config.getOrThrow<string>('WEB_ORIGIN'),
      ...(config.get<string>('CORS_ORIGINS') ?? '')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
      'capacitor://localhost',
      'http://localhost',
      'https://localhost',
      'tauri://localhost',
    ].filter(Boolean),
  );
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin not allowed by CORS: ${origin}`));
    },
    credentials: true,
  });

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown properties
      forbidNonWhitelisted: true, // reject payloads with unknown properties
      transform: true,
    }),
  );

  app.enableShutdownHooks();

  if (config.get('NODE_ENV') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('RGS API')
      .setDescription('RGS — AI-powered business ERP for Indian SMEs')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = config.getOrThrow<number>('API_PORT');
  await app.listen(port);
  logger.log(`API listening on http://localhost:${port}/api/v1`);
  logger.log(`Swagger docs at http://localhost:${port}/api/docs`);
}

void bootstrap();
