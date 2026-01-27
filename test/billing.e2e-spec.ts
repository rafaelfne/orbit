/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { BillingService } from '../src/modules/billing/billing.service';
import { PaymentStatus } from '../src/modules/billing/billing-event.entity';

describe('Billing (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let billingService: BillingService;
  let testPlanId: string;
  let testSubscriptionId: string;

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
    billingService = moduleFixture.get<BillingService>(BillingService);
  });

  afterAll(async () => {
    // Clean up test data
    if (dataSource) {
      await dataSource.query('TRUNCATE TABLE billing_events CASCADE');
      await dataSource.query('TRUNCATE TABLE subscriptions CASCADE');
      await dataSource.query('TRUNCATE TABLE plans CASCADE');
    }
    await app.close();
  });

  beforeEach(async () => {
    // Clean up before each test
    if (dataSource) {
      await dataSource.query('TRUNCATE TABLE billing_events CASCADE');
      await dataSource.query('TRUNCATE TABLE subscriptions CASCADE');
      await dataSource.query('TRUNCATE TABLE plans CASCADE');
    }

    // Create a test plan

    const planResult = await dataSource.query(
      `INSERT INTO plans (name, price_cents, currency, interval) 
       VALUES ($1, $2, $3, $4) RETURNING id`,
      ['Test Plan', 9900, 'USD', 'MONTHLY'],
    );

    testPlanId = planResult[0].id;

    // Create a test subscription

    const subResult = await dataSource.query(
      `INSERT INTO subscriptions (plan_id, customer_id, status, start_date, current_period_start, current_period_end) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        testPlanId,
        'customer-123',
        'ACTIVE',
        new Date('2024-01-01T00:00:00Z'),
        new Date('2024-01-01T00:00:00Z'),
        new Date('2024-02-01T00:00:00Z'),
      ],
    );

    testSubscriptionId = subResult[0].id;
  });

  describe('BillingService.create', () => {
    it('should create a billing event successfully', async () => {
      const billingEvent = await billingService.create({
        subscriptionId: testSubscriptionId,
        periodStart: new Date('2024-01-01T00:00:00Z'),
        periodEnd: new Date('2024-02-01T00:00:00Z'),
        amountCents: 9900,
        currency: 'USD',
        paymentStatus: PaymentStatus.PAID,
      });

      expect(billingEvent).toBeDefined();
      expect(billingEvent.id).toBeDefined();
      expect(billingEvent.subscriptionId).toBe(testSubscriptionId);
      expect(billingEvent.amountCents).toBe(9900);
      expect(billingEvent.currency).toBe('USD');
      expect(billingEvent.paymentStatus).toBe(PaymentStatus.PAID);
      expect(billingEvent.periodStart).toEqual(
        new Date('2024-01-01T00:00:00Z'),
      );
      expect(billingEvent.periodEnd).toEqual(new Date('2024-02-01T00:00:00Z'));
    });

    it('should prevent duplicate billing events for same subscription and period', async () => {
      // Create first billing event
      await billingService.create({
        subscriptionId: testSubscriptionId,
        periodStart: new Date('2024-01-01T00:00:00Z'),
        periodEnd: new Date('2024-02-01T00:00:00Z'),
        amountCents: 9900,
        currency: 'USD',
        paymentStatus: PaymentStatus.PAID,
      });

      // Attempt to create duplicate - should throw ConflictException
      await expect(
        billingService.create({
          subscriptionId: testSubscriptionId,
          periodStart: new Date('2024-01-01T00:00:00Z'),
          periodEnd: new Date('2024-02-01T00:00:00Z'),
          amountCents: 9900,
          currency: 'USD',
          paymentStatus: PaymentStatus.PAID,
        }),
      ).rejects.toThrow(
        'A billing event for this subscription and period already exists',
      );

      // Verify only one record exists
      const events =
        await billingService.findBySubscription(testSubscriptionId);
      expect(events.length).toBe(1);
    });

    it('should allow different periods for same subscription', async () => {
      // Create billing event for period 1
      await billingService.create({
        subscriptionId: testSubscriptionId,
        periodStart: new Date('2024-01-01T00:00:00Z'),
        periodEnd: new Date('2024-02-01T00:00:00Z'),
        amountCents: 9900,
        currency: 'USD',
        paymentStatus: PaymentStatus.PAID,
      });

      // Create billing event for period 2 (different period)
      await billingService.create({
        subscriptionId: testSubscriptionId,
        periodStart: new Date('2024-02-01T00:00:00Z'),
        periodEnd: new Date('2024-03-01T00:00:00Z'),
        amountCents: 9900,
        currency: 'USD',
        paymentStatus: PaymentStatus.PAID,
      });

      // Verify both records exist
      const events =
        await billingService.findBySubscription(testSubscriptionId);
      expect(events.length).toBe(2);
    });

    it('should enforce check constraint: amount_cents >= 0', async () => {
      // Attempt to create billing event with negative amount
      await expect(
        dataSource.query(
          `INSERT INTO billing_events (subscription_id, period_start, period_end, amount_cents, currency, payment_status) 
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            testSubscriptionId,
            new Date('2024-01-01T00:00:00Z'),
            new Date('2024-02-01T00:00:00Z'),
            -100, // Negative amount
            'USD',
            'PAID',
          ],
        ),
      ).rejects.toThrow();
    });

    it('should enforce check constraint: period_end > period_start', async () => {
      // Attempt to create billing event with period_end before period_start
      await expect(
        dataSource.query(
          `INSERT INTO billing_events (subscription_id, period_start, period_end, amount_cents, currency, payment_status) 
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            testSubscriptionId,
            new Date('2024-02-01T00:00:00Z'), // Start
            new Date('2024-01-01T00:00:00Z'), // End before start
            9900,
            'USD',
            'PAID',
          ],
        ),
      ).rejects.toThrow();
    });

    it('should enforce check constraint: payment_status IN (PAID, UNPAID)', async () => {
      // Attempt to create billing event with invalid payment status
      await expect(
        dataSource.query(
          `INSERT INTO billing_events (subscription_id, period_start, period_end, amount_cents, currency, payment_status) 
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            testSubscriptionId,
            new Date('2024-01-01T00:00:00Z'),
            new Date('2024-02-01T00:00:00Z'),
            9900,
            'USD',
            'INVALID_STATUS',
          ],
        ),
      ).rejects.toThrow();
    });

    it('should enforce foreign key constraint: subscription_id must exist', async () => {
      const nonExistentSubId = '00000000-0000-0000-0000-000000000000';

      // Attempt to create billing event with non-existent subscription
      await expect(
        dataSource.query(
          `INSERT INTO billing_events (subscription_id, period_start, period_end, amount_cents, currency, payment_status) 
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            nonExistentSubId,
            new Date('2024-01-01T00:00:00Z'),
            new Date('2024-02-01T00:00:00Z'),
            9900,
            'USD',
            'PAID',
          ],
        ),
      ).rejects.toThrow();
    });

    it('should prevent deletion of subscription with billing events (ON DELETE RESTRICT)', async () => {
      // Create billing event
      await billingService.create({
        subscriptionId: testSubscriptionId,
        periodStart: new Date('2024-01-01T00:00:00Z'),
        periodEnd: new Date('2024-02-01T00:00:00Z'),
        amountCents: 9900,
        currency: 'USD',
        paymentStatus: PaymentStatus.PAID,
      });

      // Attempt to delete subscription - should fail due to ON DELETE RESTRICT
      await expect(
        dataSource.query(`DELETE FROM subscriptions WHERE id = $1`, [
          testSubscriptionId,
        ]),
      ).rejects.toThrow();
    });
  });

  describe('BillingService.findBySubscription', () => {
    it('should return billing events ordered by period_end DESC', async () => {
      // Create multiple billing events
      await billingService.create({
        subscriptionId: testSubscriptionId,
        periodStart: new Date('2024-01-01T00:00:00Z'),
        periodEnd: new Date('2024-02-01T00:00:00Z'),
        amountCents: 9900,
        currency: 'USD',
        paymentStatus: PaymentStatus.PAID,
      });

      await billingService.create({
        subscriptionId: testSubscriptionId,
        periodStart: new Date('2024-02-01T00:00:00Z'),
        periodEnd: new Date('2024-03-01T00:00:00Z'),
        amountCents: 9900,
        currency: 'USD',
        paymentStatus: PaymentStatus.PAID,
      });

      await billingService.create({
        subscriptionId: testSubscriptionId,
        periodStart: new Date('2024-03-01T00:00:00Z'),
        periodEnd: new Date('2024-04-01T00:00:00Z'),
        amountCents: 9900,
        currency: 'USD',
        paymentStatus: PaymentStatus.UNPAID,
      });

      const events =
        await billingService.findBySubscription(testSubscriptionId);

      expect(events.length).toBe(3);
      // Verify ordering: most recent period_end first
      expect(events[0].periodEnd).toEqual(new Date('2024-04-01T00:00:00Z'));
      expect(events[1].periodEnd).toEqual(new Date('2024-03-01T00:00:00Z'));
      expect(events[2].periodEnd).toEqual(new Date('2024-02-01T00:00:00Z'));
    });

    it('should return empty array for subscription with no billing events', async () => {
      const events =
        await billingService.findBySubscription(testSubscriptionId);
      expect(events).toEqual([]);
    });
  });

  describe('Index verification', () => {
    it('should have index on (subscription_id, period_end) for efficient queries', async () => {
      // Query pg_indexes to verify the index exists

      const indexes = await dataSource.query(
        `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'billing_events'`,
      );

      const hasSubPeriodIndex = indexes.some((idx) =>
        idx.indexname.includes('subscription_period_end'),
      );

      expect(hasSubPeriodIndex).toBe(true);
    });
  });

  describe('POST /billing/simulate', () => {
    it('should simulate billing for a single subscription', async () => {
      // Create a subscription with period that ended 2 months ago
      const now = new Date();
      const twoMonthsAgo = new Date(now);
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
      const oneMonthAgo = new Date(now);
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

      const subResult = await dataSource.query(
        `INSERT INTO subscriptions (plan_id, customer_id, status, start_date, current_period_start, current_period_end) 
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [
          testPlanId,
          'customer-sim-test',
          'ACTIVE',
          twoMonthsAgo,
          twoMonthsAgo,
          oneMonthAgo,
        ],
      );

      const subId = subResult[0].id;

      const response = await request(app.getHttpServer())
        .post('/billing/simulate')
        .send({
          subscriptionId: subId,
          maxPeriodsPerSubscription: 12,
          dryRun: false,
        })
        .expect(200);

      expect(response.body.processedSubscriptions).toBe(1);
      expect(response.body.createdBillingRecords).toBeGreaterThanOrEqual(1);
      expect(response.body.results).toHaveLength(1);
      expect(response.body.results[0].subscriptionId).toBe(subId);
      expect(response.body.results[0].periodsProcessed).toBeGreaterThanOrEqual(
        1,
      );

      // Verify billing events were created
      const billingEvents = await dataSource.query(
        `SELECT * FROM billing_events WHERE subscription_id = $1 ORDER BY period_end ASC`,
        [subId],
      );

      expect(billingEvents.length).toBeGreaterThanOrEqual(1);
      expect(billingEvents[0].amount_cents).toBe(9900);
      expect(billingEvents[0].currency).toBe('USD');
      expect(billingEvents[0].payment_status).toBe('PAID');

      // Verify subscription period was advanced
      const updatedSub = await dataSource.query(
        `SELECT current_period_start, current_period_end FROM subscriptions WHERE id = $1`,
        [subId],
      );

      expect(updatedSub[0].current_period_end).toBeDefined();
      const periodEnd = new Date(updatedSub[0].current_period_end);
      expect(periodEnd.getTime()).toBeGreaterThan(now.getTime());
    });

    it('should be idempotent - rerunning does not create duplicates', async () => {
      // Create a subscription with period that ended 1 month ago
      const now = new Date();
      const oneMonthAgo = new Date(now);
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      const twoMonthsAgo = new Date(now);
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

      const subResult = await dataSource.query(
        `INSERT INTO subscriptions (plan_id, customer_id, status, start_date, current_period_start, current_period_end) 
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [
          testPlanId,
          'customer-idempotency-test',
          'ACTIVE',
          twoMonthsAgo,
          twoMonthsAgo,
          oneMonthAgo,
        ],
      );

      const subId = subResult[0].id;

      // Run simulation first time
      await request(app.getHttpServer())
        .post('/billing/simulate')
        .send({
          subscriptionId: subId,
          maxPeriodsPerSubscription: 12,
          dryRun: false,
        })
        .expect(200);

      // Count billing events after first run
      const billingEventsAfterFirst = await dataSource.query(
        `SELECT COUNT(*) as count FROM billing_events WHERE subscription_id = $1`,
        [subId],
      );
      const countAfterFirst = parseInt(
        billingEventsAfterFirst[0].count as string,
        10,
      );

      // Run simulation second time (idempotency test)
      const response2 = await request(app.getHttpServer())
        .post('/billing/simulate')
        .send({
          subscriptionId: subId,
          maxPeriodsPerSubscription: 12,
          dryRun: false,
        })
        .expect(200);

      // Second run should create 0 new billing records (idempotent)
      expect(response2.body.createdBillingRecords).toBe(0);

      // Count billing events after second run
      const billingEventsAfterSecond = await dataSource.query(
        `SELECT COUNT(*) as count FROM billing_events WHERE subscription_id = $1`,
        [subId],
      );
      const countAfterSecond = parseInt(
        billingEventsAfterSecond[0].count as string,
        10,
      );

      // Should have same count (no duplicates)
      expect(countAfterSecond).toBe(countAfterFirst);
    });

    it('should skip CANCELED subscriptions', async () => {
      // Create a canceled subscription
      const now = new Date();
      const oneMonthAgo = new Date(now);
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      const twoMonthsAgo = new Date(now);
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

      const subResult = await dataSource.query(
        `INSERT INTO subscriptions (plan_id, customer_id, status, start_date, current_period_start, current_period_end, canceled_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [
          testPlanId,
          'customer-canceled-test',
          'CANCELED',
          twoMonthsAgo,
          twoMonthsAgo,
          oneMonthAgo,
          now,
        ],
      );

      const subId = subResult[0].id;

      const response = await request(app.getHttpServer())
        .post('/billing/simulate')
        .send({
          subscriptionId: subId,
          maxPeriodsPerSubscription: 12,
          dryRun: false,
        })
        .expect(200);

      // Should process 0 subscriptions (canceled)
      expect(response.body.processedSubscriptions).toBe(0);
      expect(response.body.createdBillingRecords).toBe(0);
      expect(response.body.results).toHaveLength(0);
    });

    it('should handle dry run mode without creating records', async () => {
      // Create a subscription with period that ended 1 month ago
      const now = new Date();
      const oneMonthAgo = new Date(now);
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      const twoMonthsAgo = new Date(now);
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

      const subResult = await dataSource.query(
        `INSERT INTO subscriptions (plan_id, customer_id, status, start_date, current_period_start, current_period_end) 
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [
          testPlanId,
          'customer-dryrun-test',
          'ACTIVE',
          twoMonthsAgo,
          twoMonthsAgo,
          oneMonthAgo,
        ],
      );

      const subId = subResult[0].id;

      const response = await request(app.getHttpServer())
        .post('/billing/simulate')
        .send({
          subscriptionId: subId,
          maxPeriodsPerSubscription: 12,
          dryRun: true,
        })
        .expect(200);

      expect(response.body.processedSubscriptions).toBe(1);
      expect(response.body.results[0].periodsProcessed).toBeGreaterThanOrEqual(
        1,
      );

      // Verify NO billing events were created (dry run)
      const billingEvents = await dataSource.query(
        `SELECT COUNT(*) as count FROM billing_events WHERE subscription_id = $1`,
        [subId],
      );
      const count = parseInt(billingEvents[0].count as string, 10);
      expect(count).toBe(0);

      // Verify subscription period was NOT updated (dry run)
      const updatedSub = await dataSource.query(
        `SELECT current_period_start, current_period_end FROM subscriptions WHERE id = $1`,
        [subId],
      );

      expect(new Date(updatedSub[0].current_period_end).getTime()).toBe(
        oneMonthAgo.getTime(),
      );
    });

    it('should return 404 for non-existent subscription', async () => {
      await request(app.getHttpServer())
        .post('/billing/simulate')
        .send({
          subscriptionId: '00000000-0000-0000-0000-000000000000',
          maxPeriodsPerSubscription: 12,
          dryRun: false,
        })
        .expect(404);
    });

    it('should process multiple subscriptions when subscriptionId is not provided', async () => {
      // Create multiple subscriptions with elapsed periods
      const now = new Date();
      const oneMonthAgo = new Date(now);
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      const twoMonthsAgo = new Date(now);
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

      await dataSource.query(
        `INSERT INTO subscriptions (plan_id, customer_id, status, start_date, current_period_start, current_period_end) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          testPlanId,
          'customer-batch-1',
          'ACTIVE',
          twoMonthsAgo,
          twoMonthsAgo,
          oneMonthAgo,
        ],
      );

      await dataSource.query(
        `INSERT INTO subscriptions (plan_id, customer_id, status, start_date, current_period_start, current_period_end) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          testPlanId,
          'customer-batch-2',
          'ACTIVE',
          twoMonthsAgo,
          twoMonthsAgo,
          oneMonthAgo,
        ],
      );

      const response = await request(app.getHttpServer())
        .post('/billing/simulate')
        .send({
          maxSubscriptions: 100,
          maxPeriodsPerSubscription: 12,
          dryRun: true,
        })
        .expect(200);

      // Should process at least the 2 subscriptions we created
      expect(response.body.processedSubscriptions).toBeGreaterThanOrEqual(2);
      expect(response.body.results.length).toBeGreaterThanOrEqual(2);
    });

    it('should validate request DTO', async () => {
      // Invalid maxPeriodsPerSubscription (too high)
      await request(app.getHttpServer())
        .post('/billing/simulate')
        .send({
          maxPeriodsPerSubscription: 100, // max is 60
          dryRun: false,
        })
        .expect(400);

      // Invalid maxSubscriptions (too low)
      await request(app.getHttpServer())
        .post('/billing/simulate')
        .send({
          maxSubscriptions: 0, // min is 1
          dryRun: false,
        })
        .expect(400);
    });
  });
});
