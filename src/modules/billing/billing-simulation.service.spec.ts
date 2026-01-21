import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource, QueryRunner } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { BillingSimulationService } from './billing-simulation.service';
import { BillingService } from './billing.service';
import {
  Subscription,
  SubscriptionStatus,
} from '../subscriptions/subscription.entity';
import { Plan } from '../plans/plan.entity';

describe('BillingSimulationService', () => {
  let service: BillingSimulationService;
  let subscriptionRepository: Repository<Subscription>;
  let billingService: BillingService;
  let mockQueryRunner: Partial<QueryRunner>;

  beforeEach(async () => {
    // Mock QueryRunner
    mockQueryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      manager: {
        update: jest.fn().mockResolvedValue(undefined),
      } as unknown as QueryRunner['manager'],
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingSimulationService,
        {
          provide: getRepositoryToken(Subscription),
          useValue: {
            findOne: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Plan),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: BillingService,
          useValue: {
            create: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: {
            createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
          },
        },
      ],
    }).compile();

    service = module.get<BillingSimulationService>(BillingSimulationService);
    subscriptionRepository = module.get<Repository<Subscription>>(
      getRepositoryToken(Subscription),
    );
    billingService = module.get<BillingService>(BillingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('simulate - single subscription', () => {
    it('should throw NotFoundException if subscription does not exist', async () => {
      jest.spyOn(subscriptionRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.simulate({
          subscriptionId: 'non-existent-id',
          maxSubscriptions: 100,
          maxPeriodsPerSubscription: 12,
          dryRun: false,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return empty results for CANCELED subscription', async () => {
      const mockSubscription: Subscription = {
        id: 'sub-123',
        planId: 'plan-123',
        customerId: 'customer-123',
        status: SubscriptionStatus.CANCELED,
        startDate: new Date('2024-01-01'),
        currentPeriodStart: new Date('2024-01-01'),
        currentPeriodEnd: new Date('2024-02-01'),
        canceledAt: new Date('2024-01-15'),
        reactivatedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Subscription;

      jest
        .spyOn(subscriptionRepository, 'findOne')
        .mockResolvedValue(mockSubscription);

      const result = await service.simulate({
        subscriptionId: 'sub-123',
        maxSubscriptions: 100,
        maxPeriodsPerSubscription: 12,
        dryRun: false,
      });

      expect(result.processedSubscriptions).toBe(0);
      expect(result.createdBillingRecords).toBe(0);
      expect(result.advancedPeriods).toBe(0);
    });

    it('should simulate billing for a single period in dry run mode', async () => {
      const now = new Date('2024-03-15T00:00:00Z');
      jest.useFakeTimers().setSystemTime(now);

      const mockPlan: Plan = {
        id: 'plan-123',
        name: 'Test Plan',
        priceCents: 9900,
        currency: 'USD',
        interval: 'MONTHLY',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockSubscription: Subscription = {
        id: 'sub-123',
        planId: 'plan-123',
        plan: mockPlan,
        customerId: 'customer-123',
        status: SubscriptionStatus.ACTIVE,
        startDate: new Date('2024-01-01'),
        currentPeriodStart: new Date('2024-02-01'),
        currentPeriodEnd: new Date('2024-03-01'),
        canceledAt: null,
        reactivatedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Subscription;

      jest
        .spyOn(subscriptionRepository, 'findOne')
        .mockResolvedValue(mockSubscription);

      const result = await service.simulate({
        subscriptionId: 'sub-123',
        maxSubscriptions: 100,
        maxPeriodsPerSubscription: 12,
        dryRun: true,
      });

      expect(result.processedSubscriptions).toBe(1);
      expect(result.results[0].periodsProcessed).toBe(1);
      expect(result.results[0].billingRecordsCreated).toBe(1);
      expect(result.results[0].hitMaxPeriodsLimit).toBe(false);

      // Verify no actual DB calls were made
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(billingService.create).not.toHaveBeenCalled();

      expect(mockQueryRunner.startTransaction).not.toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should process multiple periods when subscription is behind', async () => {
      const now = new Date('2024-05-15T00:00:00Z');
      jest.useFakeTimers().setSystemTime(now);

      const mockPlan: Plan = {
        id: 'plan-123',
        name: 'Test Plan',
        priceCents: 9900,
        currency: 'USD',
        interval: 'MONTHLY',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockSubscription: Subscription = {
        id: 'sub-123',
        planId: 'plan-123',
        plan: mockPlan,
        customerId: 'customer-123',
        status: SubscriptionStatus.ACTIVE,
        startDate: new Date('2024-01-01'),
        currentPeriodStart: new Date('2024-01-01'),
        currentPeriodEnd: new Date('2024-02-01'),
        canceledAt: null,
        reactivatedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Subscription;

      jest
        .spyOn(subscriptionRepository, 'findOne')
        .mockResolvedValue(mockSubscription);

      const result = await service.simulate({
        subscriptionId: 'sub-123',
        maxSubscriptions: 100,
        maxPeriodsPerSubscription: 12,
        dryRun: true,
      });

      expect(result.processedSubscriptions).toBe(1);
      // Should process 4 periods: Feb, Mar, Apr, May (current period end would be June 1)
      expect(result.results[0].periodsProcessed).toBe(4);
      expect(result.results[0].billingRecordsCreated).toBe(4);
      expect(result.results[0].hitMaxPeriodsLimit).toBe(false);

      jest.useRealTimers();
    });

    it('should respect maxPeriodsPerSubscription limit', async () => {
      const now = new Date('2024-12-15T00:00:00Z');
      jest.useFakeTimers().setSystemTime(now);

      const mockPlan: Plan = {
        id: 'plan-123',
        name: 'Test Plan',
        priceCents: 9900,
        currency: 'USD',
        interval: 'MONTHLY',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockSubscription: Subscription = {
        id: 'sub-123',
        planId: 'plan-123',
        plan: mockPlan,
        customerId: 'customer-123',
        status: SubscriptionStatus.ACTIVE,
        startDate: new Date('2024-01-01'),
        currentPeriodStart: new Date('2024-01-01'),
        currentPeriodEnd: new Date('2024-02-01'),
        canceledAt: null,
        reactivatedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Subscription;

      jest
        .spyOn(subscriptionRepository, 'findOne')
        .mockResolvedValue(mockSubscription);

      const result = await service.simulate({
        subscriptionId: 'sub-123',
        maxSubscriptions: 100,
        maxPeriodsPerSubscription: 3,
        dryRun: true,
      });

      expect(result.processedSubscriptions).toBe(1);
      expect(result.results[0].periodsProcessed).toBe(3);
      expect(result.results[0].hitMaxPeriodsLimit).toBe(true);

      jest.useRealTimers();
    });
  });

  describe('simulate - multiple subscriptions', () => {
    it('should process multiple eligible subscriptions', async () => {
      const now = new Date('2024-03-15T00:00:00Z');
      jest.useFakeTimers().setSystemTime(now);

      const mockPlan: Plan = {
        id: 'plan-123',
        name: 'Test Plan',
        priceCents: 9900,
        currency: 'USD',
        interval: 'MONTHLY',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockSubscriptions: Subscription[] = [
        {
          id: 'sub-1',
          planId: 'plan-123',
          plan: mockPlan,
          customerId: 'customer-1',
          status: SubscriptionStatus.ACTIVE,
          startDate: new Date('2024-01-01'),
          currentPeriodStart: new Date('2024-02-01'),
          currentPeriodEnd: new Date('2024-03-01'),
          canceledAt: null,
          reactivatedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as Subscription,
        {
          id: 'sub-2',
          planId: 'plan-123',
          plan: mockPlan,
          customerId: 'customer-2',
          status: SubscriptionStatus.ACTIVE,
          startDate: new Date('2024-01-01'),
          currentPeriodStart: new Date('2024-02-01'),
          currentPeriodEnd: new Date('2024-03-01'),
          canceledAt: null,
          reactivatedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as Subscription,
      ];

      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockSubscriptions),
      };

      jest
        .spyOn(subscriptionRepository, 'createQueryBuilder')

        .mockReturnValue(mockQueryBuilder as any);

      const result = await service.simulate({
        maxSubscriptions: 100,
        maxPeriodsPerSubscription: 12,
        dryRun: true,
      });

      expect(result.processedSubscriptions).toBe(2);
      expect(result.results).toHaveLength(2);

      jest.useRealTimers();
    });
  });
});
