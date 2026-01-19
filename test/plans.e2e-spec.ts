import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';

describe('Plans (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Apply same validation as main.ts
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );

    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);
  });

  afterAll(async () => {
    // Clean up test data
    if (dataSource) {
      await dataSource.query('TRUNCATE TABLE plans CASCADE');
    }
    await app.close();
  });

  beforeEach(async () => {
    // Clean plans table before each test
    if (dataSource) {
      await dataSource.query('TRUNCATE TABLE plans CASCADE');
    }
  });

  describe('POST /plans', () => {
    it('should create a plan successfully', async () => {
      const createPlanDto = {
        name: 'Premium Plan',
        priceCents: 9900,
        currency: 'USD',
      };

      const response = await request(app.getHttpServer())
        .post('/plans')
        .send(createPlanDto)
        .expect(201);

      expect(response.body).toMatchObject({
        name: 'Premium Plan',
        priceCents: 9900,
        currency: 'USD',
        interval: 'MONTHLY',
      });
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('createdAt');
      expect(response.body).toHaveProperty('updatedAt');
    });

    it('should create a plan with explicit MONTHLY interval', async () => {
      const createPlanDto = {
        name: 'Basic Plan',
        priceCents: 4900,
        currency: 'BRL',
        interval: 'MONTHLY',
      };

      const response = await request(app.getHttpServer())
        .post('/plans')
        .send(createPlanDto)
        .expect(201);

      expect((response.body as { interval: string }).interval).toBe('MONTHLY');
    });

    it('should trim whitespace from plan name', async () => {
      const createPlanDto = {
        name: '  Whitespace Plan  ',
        priceCents: 5000,
        currency: 'USD',
      };

      const response = await request(app.getHttpServer())
        .post('/plans')
        .send(createPlanDto)
        .expect(201);

      expect((response.body as { name: string }).name).toBe('Whitespace Plan');
    });

    it('should return 409 for duplicate plan name', async () => {
      const createPlanDto = {
        name: 'Duplicate Plan',
        priceCents: 9900,
        currency: 'USD',
      };

      // First creation should succeed
      await request(app.getHttpServer())
        .post('/plans')
        .send(createPlanDto)
        .expect(201);

      // Second creation should fail
      const response = await request(app.getHttpServer())
        .post('/plans')
        .send(createPlanDto)
        .expect(409);

      expect((response.body as { message: string }).message).toContain(
        'already exists',
      );
    });

    it('should return 400 for missing required fields', async () => {
      const invalidDto = {
        name: 'Test Plan',
        // missing priceCents and currency
      };

      await request(app.getHttpServer())
        .post('/plans')
        .send(invalidDto)
        .expect(400);
    });

    it('should return 400 for invalid name length', async () => {
      const invalidDto = {
        name: 'AB', // too short
        priceCents: 9900,
        currency: 'USD',
      };

      await request(app.getHttpServer())
        .post('/plans')
        .send(invalidDto)
        .expect(400);
    });

    it('should return 400 for invalid currency', async () => {
      const invalidDto = {
        name: 'Test Plan',
        priceCents: 9900,
        currency: 'EUR', // not supported
      };

      await request(app.getHttpServer())
        .post('/plans')
        .send(invalidDto)
        .expect(400);
    });

    it('should return 400 for negative price', async () => {
      const invalidDto = {
        name: 'Test Plan',
        priceCents: -100,
        currency: 'USD',
      };

      await request(app.getHttpServer())
        .post('/plans')
        .send(invalidDto)
        .expect(400);
    });

    it('should return 400 for invalid interval', async () => {
      const invalidDto = {
        name: 'Test Plan',
        priceCents: 9900,
        currency: 'USD',
        interval: 'YEARLY', // not supported
      };

      await request(app.getHttpServer())
        .post('/plans')
        .send(invalidDto)
        .expect(400);
    });

    it('should accept zero price', async () => {
      const createPlanDto = {
        name: 'Free Plan',
        priceCents: 0,
        currency: 'USD',
      };

      const response = await request(app.getHttpServer())
        .post('/plans')
        .send(createPlanDto)
        .expect(201);

      expect((response.body as { priceCents: number }).priceCents).toBe(0);
    });
  });
});
