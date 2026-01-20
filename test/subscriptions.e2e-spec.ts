import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';

interface SubscriptionResponse {
  id: string;
  planId: string;
  customerId: string;
  status: string;
  startDate: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  canceledAt: string | null;
  reactivatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

describe('Subscriptions (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let testPlanId: string;

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
      await dataSource.query('TRUNCATE TABLE subscriptions CASCADE');
      await dataSource.query('TRUNCATE TABLE plans CASCADE');
    }
    await app.close();
  });

  beforeEach(async () => {
    // Clean up before each test
    if (dataSource) {
      await dataSource.query('TRUNCATE TABLE subscriptions CASCADE');
      await dataSource.query('TRUNCATE TABLE plans CASCADE');
    }
  });

  describe('POST /subscriptions', () => {
    beforeEach(async () => {
      // Create a test plan
      const planResponse = await request(app.getHttpServer())
        .post('/plans')
        .send({
          name: 'Test Plan',
          priceCents: 9900,
          currency: 'USD',
        })
        .expect(201);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      testPlanId = planResponse.body.id;
    });

    it('should create a subscription with correct status and period dates', async () => {
      const response = await request(app.getHttpServer())
        .post('/subscriptions')
        .send({
          planId: testPlanId,
          customerId: 'customer-123',
        })
        .expect(201);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const subscription: SubscriptionResponse = response.body;

      expect(subscription).toHaveProperty('id');
      expect(subscription.planId).toBe(testPlanId);
      expect(subscription.customerId).toBe('customer-123');
      expect(subscription.status).toBe('ACTIVE');
      expect(subscription.canceledAt).toBeNull();
      expect(subscription.reactivatedAt).toBeNull();

      // Verify period dates
      const periodStart = new Date(subscription.currentPeriodStart);
      const periodEnd = new Date(subscription.currentPeriodEnd);

      // Period end should be approximately 1 month after period start
      const daysDiff =
        (periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24);
      expect(daysDiff).toBeGreaterThanOrEqual(28);
      expect(daysDiff).toBeLessThanOrEqual(31);
    });

    it('should create a subscription with custom startDate', async () => {
      const customStartDate = '2024-03-15T10:30:00Z';

      const response = await request(app.getHttpServer())
        .post('/subscriptions')
        .send({
          planId: testPlanId,
          customerId: 'customer-456',
          startDate: customStartDate,
        })
        .expect(201);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const subscription: SubscriptionResponse = response.body;

      // Compare dates as Date objects to handle format differences
      expect(new Date(subscription.startDate)).toEqual(
        new Date(customStartDate),
      );
      expect(new Date(subscription.currentPeriodStart)).toEqual(
        new Date(customStartDate),
      );
    });

    it('should return 404 for non-existent planId', async () => {
      const response = await request(app.getHttpServer())
        .post('/subscriptions')
        .send({
          planId: '00000000-0000-0000-0000-000000000000',
          customerId: 'customer-789',
        })
        .expect(404);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(response.body.message).toContain('not found');
    });

    it('should return 409 for duplicate ACTIVE subscription', async () => {
      // Create first subscription
      await request(app.getHttpServer())
        .post('/subscriptions')
        .send({
          planId: testPlanId,
          customerId: 'customer-duplicate',
        })
        .expect(201);

      // Attempt to create duplicate
      const response = await request(app.getHttpServer())
        .post('/subscriptions')
        .send({
          planId: testPlanId,
          customerId: 'customer-duplicate',
        })
        .expect(409);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(response.body.message).toContain('already exists');
    });

    it('should return 400 for missing required fields', async () => {
      await request(app.getHttpServer())
        .post('/subscriptions')
        .send({
          planId: testPlanId,
          // missing customerId
        })
        .expect(400);

      await request(app.getHttpServer())
        .post('/subscriptions')
        .send({
          customerId: 'customer-123',
          // missing planId
        })
        .expect(400);
    });

    it('should return 400 for invalid startDate format', async () => {
      await request(app.getHttpServer())
        .post('/subscriptions')
        .send({
          planId: testPlanId,
          customerId: 'customer-invalid',
          startDate: 'not-a-date',
        })
        .expect(400);
    });

    it('should return 400 for customerId exceeding max length', async () => {
      const longCustomerId = 'a'.repeat(65); // Max is 64

      await request(app.getHttpServer())
        .post('/subscriptions')
        .send({
          planId: testPlanId,
          customerId: longCustomerId,
        })
        .expect(400);
    });
  });
});
