import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';

interface PaginatedPlansResponse {
  items: Array<{
    id: string;
    name: string;
    priceCents: number;
    currency: string;
    interval: string;
    createdAt: string;
    updatedAt: string;
    fx?: {
      baseCurrency: string;
      quoteCurrency: string;
      rate: string;
      asOf: string;
      originalPriceCents: number;
    };
  }>;
  page: number;
  pageSize: number;
  total: number;
}

interface PlanResponse {
  id: string;
  name: string;
  priceCents: number;
  currency: string;
  interval: string;
  createdAt: string;
  updatedAt: string;
  fx?: {
    baseCurrency: string;
    quoteCurrency: string;
    rate: string;
    asOf: string;
    originalPriceCents: number;
  };
}

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
    // Clean plans and fx_rates tables before each test
    if (dataSource) {
      await dataSource.query('TRUNCATE TABLE fx_rates CASCADE');
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

  describe('GET /plans', () => {
    it('should return empty list when no plans exist', async () => {
      const response = await request(app.getHttpServer())
        .get('/plans')
        .expect(200);

      expect(response.body).toEqual({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
      });
    });

    it('should return paginated list of plans', async () => {
      // Create test plans
      await request(app.getHttpServer())
        .post('/plans')
        .send({ name: 'Plan 1', priceCents: 1000, currency: 'USD' });
      await request(app.getHttpServer())
        .post('/plans')
        .send({ name: 'Plan 2', priceCents: 2000, currency: 'USD' });
      await request(app.getHttpServer())
        .post('/plans')
        .send({ name: 'Plan 3', priceCents: 3000, currency: 'USD' });

      const response = await request(app.getHttpServer())
        .get('/plans')
        .expect(200);

      const body = response.body as PaginatedPlansResponse;
      expect(body.items).toHaveLength(3);
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(20);
      expect(body.total).toBe(3);
      // Should be ordered by createdAt DESC (most recent first)
      expect(body.items[0].name).toBe('Plan 3');
    });

    it('should handle pagination parameters', async () => {
      // Create test plans
      for (let i = 1; i <= 5; i++) {
        await request(app.getHttpServer())
          .post('/plans')
          .send({ name: `Plan ${i}`, priceCents: i * 1000, currency: 'USD' });
      }

      const response = await request(app.getHttpServer())
        .get('/plans?page=2&pageSize=2')
        .expect(200);

      const body = response.body as PaginatedPlansResponse;
      expect(body.items).toHaveLength(2);
      expect(body.page).toBe(2);
      expect(body.pageSize).toBe(2);
      expect(body.total).toBe(5);
    });

    it('should validate page and pageSize parameters', async () => {
      await request(app.getHttpServer()).get('/plans?page=0').expect(400);

      await request(app.getHttpServer()).get('/plans?pageSize=101').expect(400);

      await request(app.getHttpServer()).get('/plans?page=abc').expect(400);
    });

    it('should convert prices when currency parameter is provided', async () => {
      // Create a plan in USD
      const createResponse = await request(app.getHttpServer())
        .post('/plans')
        .send({ name: 'USD Plan', priceCents: 10000, currency: 'USD' });

      const planId = (createResponse.body as { id: string }).id;

      // Insert FX rate
      await dataSource.query(
        `INSERT INTO fx_rates (base_currency, quote_currency, rate, as_of) 
         VALUES ('USD', 'BRL', 5.25, NOW())`,
      );

      const response = await request(app.getHttpServer())
        .get('/plans?currency=BRL')
        .expect(200);

      const body = response.body as PaginatedPlansResponse;
      expect(body.items).toHaveLength(1);
      expect(body.items[0].id).toBe(planId);
      expect(body.items[0].priceCents).toBe(52500); // 10000 * 5.25
      expect(body.items[0].currency).toBe('BRL');
      expect(body.items[0].fx).toBeDefined();
      expect(body.items[0].fx?.baseCurrency).toBe('USD');
      expect(body.items[0].fx?.quoteCurrency).toBe('BRL');
      expect(body.items[0].fx?.rate).toBe('5.2500000000');
      expect(body.items[0].fx?.originalPriceCents).toBe(10000);
    });

    it('should not convert when currency matches plan currency', async () => {
      await request(app.getHttpServer())
        .post('/plans')
        .send({ name: 'USD Plan', priceCents: 10000, currency: 'USD' });

      const response = await request(app.getHttpServer())
        .get('/plans?currency=USD')
        .expect(200);

      const body = response.body as PaginatedPlansResponse;
      expect(body.items[0].priceCents).toBe(10000);
      expect(body.items[0].currency).toBe('USD');
      expect(body.items[0].fx).toBeUndefined();
    });

    it('should return 422 when FX rate not found for conversion', async () => {
      await request(app.getHttpServer())
        .post('/plans')
        .send({ name: 'USD Plan', priceCents: 10000, currency: 'USD' });

      await request(app.getHttpServer()).get('/plans?currency=BRL').expect(422);
    });

    it('should validate currency parameter', async () => {
      await request(app.getHttpServer()).get('/plans?currency=EUR').expect(400);
    });
  });

  describe('GET /plans/:id', () => {
    it('should return a plan by id', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/plans')
        .send({ name: 'Test Plan', priceCents: 9900, currency: 'USD' });

      const planId = (createResponse.body as { id: string }).id;

      const response = await request(app.getHttpServer())
        .get(`/plans/${planId}`)
        .expect(200);

      const body = response.body as PlanResponse;
      expect(body.id).toBe(planId);
      expect(body.name).toBe('Test Plan');
      expect(body.priceCents).toBe(9900);
      expect(body.currency).toBe('USD');
      expect(body.interval).toBe('MONTHLY');
    });

    it('should return 404 for non-existent plan', async () => {
      await request(app.getHttpServer())
        .get('/plans/550e8400-e29b-41d4-a716-446655440000')
        .expect(404);
    });

    it('should convert price when currency parameter is provided', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/plans')
        .send({ name: 'USD Plan', priceCents: 10000, currency: 'USD' });

      const planId = (createResponse.body as { id: string }).id;

      // Insert FX rate
      await dataSource.query(
        `INSERT INTO fx_rates (base_currency, quote_currency, rate, as_of) 
         VALUES ('USD', 'BRL', 5.25, NOW())`,
      );

      const response = await request(app.getHttpServer())
        .get(`/plans/${planId}?currency=BRL`)
        .expect(200);

      const body = response.body as PlanResponse;
      expect(body.priceCents).toBe(52500); // 10000 * 5.25
      expect(body.currency).toBe('BRL');
      expect(body.fx).toBeDefined();
      expect(body.fx?.baseCurrency).toBe('USD');
      expect(body.fx?.quoteCurrency).toBe('BRL');
      expect(body.fx?.rate).toBe('5.2500000000');
      expect(body.fx?.originalPriceCents).toBe(10000);
    });

    it('should not convert when currency matches plan currency', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/plans')
        .send({ name: 'USD Plan', priceCents: 10000, currency: 'USD' });

      const planId = (createResponse.body as { id: string }).id;

      const response = await request(app.getHttpServer())
        .get(`/plans/${planId}?currency=USD`)
        .expect(200);

      const body = response.body as PlanResponse;
      expect(body.priceCents).toBe(10000);
      expect(body.currency).toBe('USD');
      expect(body.fx).toBeUndefined();
    });

    it('should return 422 when FX rate not found for conversion', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/plans')
        .send({ name: 'USD Plan', priceCents: 10000, currency: 'USD' });

      const planId = (createResponse.body as { id: string }).id;

      await request(app.getHttpServer())
        .get(`/plans/${planId}?currency=BRL`)
        .expect(422);
    });

    it('should validate currency parameter', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/plans')
        .send({ name: 'Test Plan', priceCents: 9900, currency: 'USD' });

      const planId = (createResponse.body as { id: string }).id;

      await request(app.getHttpServer())
        .get(`/plans/${planId}?currency=EUR`)
        .expect(400);
    });
  });
});
