import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable validation with transform
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Configure OpenAPI
  const config = new DocumentBuilder()
    .setTitle('Open Subscriptions API')
    .setDescription('API for managing subscription plans and billing')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // Serve OpenAPI JSON
  app.use('/openapi.json', (_req, res: { json: (data: unknown) => void }) => {
    res.json(document);
  });

  app.enableCors();

  // Serve Scalar API documentation
  app.use(
    '/docs',
    apiReference({
      spec: {
        content: document,
      },
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
