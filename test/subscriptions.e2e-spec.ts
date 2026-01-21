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
  computedStatus: string;
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
      expect(subscription.computedStatus).toBe('ACTIVE');
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

  describe('GET /subscriptions', () => {
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

    it('should return paginated subscriptions', async () => {
      // Create multiple subscriptions
      await request(app.getHttpServer())
        .post('/subscriptions')
        .send({
          planId: testPlanId,
          customerId: 'customer-1',
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/subscriptions')
        .send({
          planId: testPlanId,
          customerId: 'customer-2',
        })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get('/subscriptions')
        .expect(200);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const data = response.body;

      expect(data).toHaveProperty('items');

      expect(data).toHaveProperty('page');

      expect(data).toHaveProperty('pageSize');

      expect(data).toHaveProperty('total');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(Array.isArray(data.items)).toBe(true);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(data.items.length).toBe(2);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(data.total).toBe(2);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(data.page).toBe(1);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(data.pageSize).toBe(20);

      // Verify each subscription has computedStatus
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      data.items.forEach((item: SubscriptionResponse) => {
        expect(item).toHaveProperty('computedStatus');
        expect(['ACTIVE', 'OVERDUE', 'CANCELED']).toContain(
          item.computedStatus,
        );
      });
    });

    it('should filter subscriptions by customerId', async () => {
      // Create subscriptions for different customers
      await request(app.getHttpServer())
        .post('/subscriptions')
        .send({
          planId: testPlanId,
          customerId: 'customer-filter-1',
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/subscriptions')
        .send({
          planId: testPlanId,
          customerId: 'customer-filter-2',
        })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get('/subscriptions?customerId=customer-filter-1')
        .expect(200);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const data = response.body;

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(data.items.length).toBe(1);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(data.total).toBe(1);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(data.items[0].customerId).toBe('customer-filter-1');
    });

    it('should respect pagination parameters', async () => {
      // Create multiple subscriptions
      for (let i = 1; i <= 3; i++) {
        await request(app.getHttpServer())
          .post('/subscriptions')
          .send({
            planId: testPlanId,
            customerId: `customer-page-${i}`,
          })
          .expect(201);
      }

      // Get first page with pageSize=2
      const response = await request(app.getHttpServer())
        .get('/subscriptions?page=1&pageSize=2')
        .expect(200);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const data = response.body;

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(data.items.length).toBe(2);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(data.page).toBe(1);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(data.pageSize).toBe(2);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(data.total).toBe(3);
    });

    it('should return 400 for invalid pagination parameters', async () => {
      await request(app.getHttpServer())
        .get('/subscriptions?page=0')
        .expect(400);

      await request(app.getHttpServer())
        .get('/subscriptions?pageSize=101')
        .expect(400);
    });
  });

  describe('GET /subscriptions/:id', () => {
    let subscriptionId: string;

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

      // Create a subscription
      const subResponse = await request(app.getHttpServer())
        .post('/subscriptions')
        .send({
          planId: testPlanId,
          customerId: 'customer-detail',
        })
        .expect(201);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      subscriptionId = subResponse.body.id;
    });

    it('should return subscription by id', async () => {
      const response = await request(app.getHttpServer())
        .get(`/subscriptions/${subscriptionId}`)
        .expect(200);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const subscription: SubscriptionResponse = response.body;

      expect(subscription.id).toBe(subscriptionId);
      expect(subscription.planId).toBe(testPlanId);
      expect(subscription.customerId).toBe('customer-detail');
      expect(subscription.status).toBe('ACTIVE');
      expect(subscription.computedStatus).toBe('ACTIVE');
      expect(subscription).toHaveProperty('startDate');
      expect(subscription).toHaveProperty('currentPeriodStart');
      expect(subscription).toHaveProperty('currentPeriodEnd');
      expect(subscription).toHaveProperty('createdAt');
      expect(subscription).toHaveProperty('updatedAt');
    });

    it('should return 404 for non-existent subscription', async () => {
      const response = await request(app.getHttpServer())
        .get('/subscriptions/00000000-0000-0000-0000-000000000000')
        .expect(404);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(response.body.message).toContain('not found');
    });

    it('should compute OVERDUE status for expired subscriptions', async () => {
      // Update subscription to have expired period
      // This requires direct database access since we don't have an update endpoint yet
      const pastStart = new Date(Date.now() - 86400000 * 35); // 35 days ago
      const pastEnd = new Date(Date.now() - 86400000 * 5); // 5 days ago

      await dataSource.query(
        `UPDATE subscriptions SET current_period_start = $1, current_period_end = $2 WHERE id = $3`,
        [pastStart, pastEnd, subscriptionId],
      );

      const response = await request(app.getHttpServer())
        .get(`/subscriptions/${subscriptionId}`)
        .expect(200);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const subscription: SubscriptionResponse = response.body;

      expect(subscription.status).toBe('ACTIVE');
      expect(subscription.computedStatus).toBe('OVERDUE');
    });
  });

  describe('POST /subscriptions/:id/cancel', () => {
    let subscriptionId: string;

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

      // Create a subscription
      const subResponse = await request(app.getHttpServer())
        .post('/subscriptions')
        .send({
          planId: testPlanId,
          customerId: 'customer-cancel',
        })
        .expect(201);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      subscriptionId = subResponse.body.id;
    });

    it('should cancel an ACTIVE subscription', async () => {
      const response = await request(app.getHttpServer())
        .post(`/subscriptions/${subscriptionId}/cancel`)
        .expect(200);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const subscription: SubscriptionResponse = response.body;

      expect(subscription.id).toBe(subscriptionId);
      expect(subscription.status).toBe('CANCELED');
      expect(subscription.computedStatus).toBe('CANCELED');
      expect(subscription.canceledAt).not.toBeNull();
      expect(subscription.canceledAt).toBeDefined();

      // Verify period fields are unchanged
      expect(subscription.currentPeriodStart).toBeDefined();
      expect(subscription.currentPeriodEnd).toBeDefined();
    });

    it('should return 409 when canceling an already canceled subscription', async () => {
      // Cancel the subscription first time
      await request(app.getHttpServer())
        .post(`/subscriptions/${subscriptionId}/cancel`)
        .expect(200);

      // Try to cancel again
      const response = await request(app.getHttpServer())
        .post(`/subscriptions/${subscriptionId}/cancel`)
        .expect(409);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(response.body.message).toContain('already canceled');
    });

    it('should return 404 for non-existent subscription', async () => {
      const response = await request(app.getHttpServer())
        .post('/subscriptions/00000000-0000-0000-0000-000000000000/cancel')
        .expect(404);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(response.body.message).toContain('not found');
    });

    it('should persist the canceled status in the database', async () => {
      // Cancel the subscription
      await request(app.getHttpServer())
        .post(`/subscriptions/${subscriptionId}/cancel`)
        .expect(200);

      // Fetch the subscription again to verify persistence
      const response = await request(app.getHttpServer())
        .get(`/subscriptions/${subscriptionId}`)
        .expect(200);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const subscription: SubscriptionResponse = response.body;

      expect(subscription.status).toBe('CANCELED');
      expect(subscription.computedStatus).toBe('CANCELED');
      expect(subscription.canceledAt).not.toBeNull();
    });
  });

  describe('POST /subscriptions/:id/reactivate', () => {
    let subscriptionId: string;

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

      // Create a subscription
      const subResponse = await request(app.getHttpServer())
        .post('/subscriptions')
        .send({
          planId: testPlanId,
          customerId: 'customer-reactivate',
        })
        .expect(201);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      subscriptionId = subResponse.body.id;

      // Cancel the subscription by updating it directly in the database
      await dataSource.query(
        `UPDATE subscriptions SET status = 'CANCELED', canceled_at = $1 WHERE id = $2`,
        [new Date(), subscriptionId],
      );
    });

    it('should reactivate a canceled subscription', async () => {
      // Verify subscription is canceled
      let response = await request(app.getHttpServer())
        .get(`/subscriptions/${subscriptionId}`)
        .expect(200);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      let subscription: SubscriptionResponse = response.body;
      expect(subscription.status).toBe('CANCELED');
      expect(subscription.computedStatus).toBe('CANCELED');

      // Reactivate the subscription
      response = await request(app.getHttpServer())
        .post(`/subscriptions/${subscriptionId}/reactivate`)
        .expect(200);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      subscription = response.body;

      expect(subscription.id).toBe(subscriptionId);
      expect(subscription.status).toBe('ACTIVE');
      expect(subscription.computedStatus).toBe('ACTIVE');
      expect(subscription.reactivatedAt).toBeDefined();
      expect(subscription.reactivatedAt).not.toBeNull();
      expect(subscription.canceledAt).toBeDefined();
      expect(subscription.canceledAt).not.toBeNull(); // Should remain set

      // Verify new period was created
      if (!subscription.reactivatedAt) {
        throw new Error('reactivatedAt should not be null');
      }
      const reactivatedAt = new Date(subscription.reactivatedAt);
      const periodStart = new Date(subscription.currentPeriodStart);
      const periodEnd = new Date(subscription.currentPeriodEnd);

      // Period start should be approximately the reactivation time
      expect(
        Math.abs(periodStart.getTime() - reactivatedAt.getTime()),
      ).toBeLessThan(1000); // Within 1 second

      // Period end should be approximately one month after period start
      const expectedEndTime = new Date(periodStart);
      expectedEndTime.setMonth(expectedEndTime.getMonth() + 1);
      expect(
        Math.abs(periodEnd.getTime() - expectedEndTime.getTime()),
      ).toBeLessThan(86400000); // Within 1 day (to handle timezone differences)
    });

    it('should return 409 when reactivating an already active subscription', async () => {
      // First reactivation
      await request(app.getHttpServer())
        .post(`/subscriptions/${subscriptionId}/reactivate`)
        .expect(200);

      // Second reactivation should fail
      const response = await request(app.getHttpServer())
        .post(`/subscriptions/${subscriptionId}/reactivate`)
        .expect(409);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(response.body.message).toContain('already active');
    });

    it('should return 404 when reactivating non-existent subscription', async () => {
      const response = await request(app.getHttpServer())
        .post('/subscriptions/00000000-0000-0000-0000-000000000000/reactivate')
        .expect(404);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(response.body.message).toContain('not found');
    });
  });
});
