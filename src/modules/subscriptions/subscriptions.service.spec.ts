import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import {
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { Subscription, SubscriptionStatus } from './subscription.entity';
import { Plan } from '../plans/plan.entity';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { ComputedStatus } from './dto/computed-status.enum';

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;
  let subscriptionRepository: Repository<Subscription>;
  let planRepository: Repository<Plan>;

  const mockPlan: Plan = {
    id: 'plan-123',
    name: 'Premium Plan',
    priceCents: 9900,
    currency: 'USD',
    interval: 'MONTHLY',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        {
          provide: getRepositoryToken(Subscription),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
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
      ],
    }).compile();

    service = module.get<SubscriptionsService>(SubscriptionsService);
    subscriptionRepository = module.get<Repository<Subscription>>(
      getRepositoryToken(Subscription),
    );
    planRepository = module.get<Repository<Plan>>(getRepositoryToken(Plan));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createDto: CreateSubscriptionDto = {
      planId: 'plan-123',
      customerId: 'customer-456',
    };

    it('should create a subscription with correct status and period dates', async () => {
      jest.spyOn(planRepository, 'findOne').mockResolvedValue(mockPlan);

      const mockSubscription: Subscription = {
        id: 'sub-789',
        planId: createDto.planId,
        customerId: createDto.customerId,
        status: SubscriptionStatus.ACTIVE,
        startDate: new Date('2024-01-20T15:00:00Z'),
        currentPeriodStart: new Date('2024-01-20T15:00:00Z'),
        currentPeriodEnd: new Date('2024-02-20T15:00:00Z'),
        canceledAt: null,
        reactivatedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        plan: mockPlan,
      };

      jest
        .spyOn(subscriptionRepository, 'create')
        .mockReturnValue(mockSubscription);
      jest
        .spyOn(subscriptionRepository, 'save')
        .mockResolvedValue(mockSubscription);

      const result = await service.create(createDto);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(planRepository.findOne).toHaveBeenCalledWith({
        where: { id: createDto.planId },
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(subscriptionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          planId: createDto.planId,
          customerId: createDto.customerId,
          status: SubscriptionStatus.ACTIVE,
          canceledAt: null,
          reactivatedAt: null,
        }),
      );
      expect(result.status).toBe(SubscriptionStatus.ACTIVE);
      expect(result.customerId).toBe(createDto.customerId);
      expect(result.planId).toBe(createDto.planId);
      expect(result.computedStatus).toBeDefined();
    });

    it('should throw NotFoundException if plan does not exist', async () => {
      jest.spyOn(planRepository, 'findOne').mockResolvedValue(null);

      await expect(service.create(createDto)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.create(createDto)).rejects.toThrow(
        'Plan with id plan-123 not found',
      );
    });

    it('should throw ConflictException for duplicate ACTIVE subscription', async () => {
      jest.spyOn(planRepository, 'findOne').mockResolvedValue(mockPlan);
      jest.spyOn(subscriptionRepository, 'create').mockReturnValue({
        id: 'sub-789',
      } as Subscription);

      const dbError = {
        code: '23505', // PostgreSQL unique constraint violation
        detail:
          'Key (customer_id, plan_id)=(customer-456, plan-123) already exists.',
      };
      jest.spyOn(subscriptionRepository, 'save').mockRejectedValue(dbError);

      await expect(service.create(createDto)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.create(createDto)).rejects.toThrow(
        'An active subscription for this customer and plan already exists',
      );
    });

    it('should handle custom startDate correctly', async () => {
      const customStartDate = '2024-03-15T10:30:00Z';
      const dtoWithStartDate: CreateSubscriptionDto = {
        ...createDto,
        startDate: customStartDate,
      };

      jest.spyOn(planRepository, 'findOne').mockResolvedValue(mockPlan);

      const mockSubscription: Subscription = {
        id: 'sub-789',
        planId: createDto.planId,
        customerId: createDto.customerId,
        status: SubscriptionStatus.ACTIVE,
        startDate: new Date(customStartDate),
        currentPeriodStart: new Date(customStartDate),
        currentPeriodEnd: new Date('2024-04-15T10:30:00Z'),
        canceledAt: null,
        reactivatedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        plan: mockPlan,
      };

      jest
        .spyOn(subscriptionRepository, 'create')
        .mockReturnValue(mockSubscription);
      jest
        .spyOn(subscriptionRepository, 'save')
        .mockResolvedValue(mockSubscription);

      const result = await service.create(dtoWithStartDate);

      expect(result.startDate).toEqual(new Date(customStartDate));
      expect(result.currentPeriodStart).toEqual(new Date(customStartDate));
    });

    it('should throw InternalServerErrorException for unknown database errors', async () => {
      jest.spyOn(planRepository, 'findOne').mockResolvedValue(mockPlan);
      jest.spyOn(subscriptionRepository, 'create').mockReturnValue({
        id: 'sub-789',
      } as Subscription);

      const dbError = new Error('Database connection lost');
      jest.spyOn(subscriptionRepository, 'save').mockRejectedValue(dbError);

      await expect(service.create(createDto)).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(service.create(createDto)).rejects.toThrow(
        'An error occurred while creating the subscription',
      );
    });
  });

  describe('computedStatus', () => {
    it('should return CANCELED for canceled subscriptions', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);

      const canceledSubscription: Subscription = {
        id: 'sub-123',
        planId: 'plan-123',
        customerId: 'customer-456',
        status: SubscriptionStatus.CANCELED,
        startDate: new Date('2024-01-01'),
        currentPeriodStart: new Date('2024-01-01'),
        currentPeriodEnd: futureDate,
        canceledAt: new Date(),
        reactivatedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        plan: mockPlan,
      };

      jest
        .spyOn(subscriptionRepository, 'findOne')
        .mockResolvedValue(canceledSubscription);

      const result = await service.findById('sub-123');
      expect(result.computedStatus).toBe(ComputedStatus.CANCELED);
    });

    it('should return ACTIVE for active subscriptions with non-expired periods', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);

      const activeSubscription: Subscription = {
        id: 'sub-123',
        planId: 'plan-123',
        customerId: 'customer-456',
        status: SubscriptionStatus.ACTIVE,
        startDate: new Date('2024-01-01'),
        currentPeriodStart: new Date('2024-01-01'),
        currentPeriodEnd: futureDate,
        canceledAt: null,
        reactivatedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        plan: mockPlan,
      };

      jest
        .spyOn(subscriptionRepository, 'findOne')
        .mockResolvedValue(activeSubscription);

      const result = await service.findById('sub-123');
      expect(result.computedStatus).toBe(ComputedStatus.ACTIVE);
    });

    it('should return OVERDUE for active subscriptions with expired periods', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 5);

      const overdueSubscription: Subscription = {
        id: 'sub-123',
        planId: 'plan-123',
        customerId: 'customer-456',
        status: SubscriptionStatus.ACTIVE,
        startDate: new Date('2024-01-01'),
        currentPeriodStart: new Date('2024-01-01'),
        currentPeriodEnd: pastDate,
        canceledAt: null,
        reactivatedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        plan: mockPlan,
      };

      jest
        .spyOn(subscriptionRepository, 'findOne')
        .mockResolvedValue(overdueSubscription);

      const result = await service.findById('sub-123');
      expect(result.computedStatus).toBe(ComputedStatus.OVERDUE);
    });
  });

  describe('findAll', () => {
    it('should return paginated subscriptions', async () => {
      const mockSubscriptions: Subscription[] = [
        {
          id: 'sub-1',
          planId: 'plan-123',
          customerId: 'customer-1',
          status: SubscriptionStatus.ACTIVE,
          startDate: new Date('2024-01-01'),
          currentPeriodStart: new Date('2024-01-01'),
          currentPeriodEnd: new Date('2024-02-01'),
          canceledAt: null,
          reactivatedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          plan: mockPlan,
        },
        {
          id: 'sub-2',
          planId: 'plan-123',
          customerId: 'customer-2',
          status: SubscriptionStatus.ACTIVE,
          startDate: new Date('2024-01-02'),
          currentPeriodStart: new Date('2024-01-02'),
          currentPeriodEnd: new Date('2024-02-02'),
          canceledAt: null,
          reactivatedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          plan: mockPlan,
        },
      ];

      const mockQueryBuilder = {
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getManyAndCount: jest
          .fn()
          .mockResolvedValue([mockSubscriptions, mockSubscriptions.length]),
      } as unknown as SelectQueryBuilder<Subscription>;

      jest
        .spyOn(subscriptionRepository, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder);

      const result = await service.findAll(1, 20);

      expect(result.items).toHaveLength(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.total).toBe(2);
      expect(result.items[0].computedStatus).toBeDefined();
    });

    it('should filter by customerId when provided', async () => {
      const mockSubscriptions: Subscription[] = [
        {
          id: 'sub-1',
          planId: 'plan-123',
          customerId: 'customer-1',
          status: SubscriptionStatus.ACTIVE,
          startDate: new Date('2024-01-01'),
          currentPeriodStart: new Date('2024-01-01'),
          currentPeriodEnd: new Date('2024-02-01'),
          canceledAt: null,
          reactivatedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          plan: mockPlan,
        },
      ];

      const mockQueryBuilder = {
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getManyAndCount: jest
          .fn()
          .mockResolvedValue([mockSubscriptions, mockSubscriptions.length]),
      } as unknown as SelectQueryBuilder<Subscription>;

      jest
        .spyOn(subscriptionRepository, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder);

      const result = await service.findAll(1, 20, 'customer-1');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'subscription.customerId = :customerId',
        { customerId: 'customer-1' },
      );
      expect(result.items).toHaveLength(1);
      expect(result.items[0].customerId).toBe('customer-1');
    });

    it('should throw InternalServerErrorException on database error', async () => {
      const mockQueryBuilder = {
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getManyAndCount: jest
          .fn()
          .mockRejectedValue(new Error('Database error')),
      } as unknown as SelectQueryBuilder<Subscription>;

      jest
        .spyOn(subscriptionRepository, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder);

      await expect(service.findAll(1, 20)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('findById', () => {
    it('should return subscription by id', async () => {
      const mockSubscription: Subscription = {
        id: 'sub-123',
        planId: 'plan-123',
        customerId: 'customer-456',
        status: SubscriptionStatus.ACTIVE,
        startDate: new Date('2024-01-01'),
        currentPeriodStart: new Date('2024-01-01'),
        currentPeriodEnd: new Date('2024-02-01'),
        canceledAt: null,
        reactivatedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        plan: mockPlan,
      };

      jest
        .spyOn(subscriptionRepository, 'findOne')
        .mockResolvedValue(mockSubscription);

      const result = await service.findById('sub-123');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(subscriptionRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'sub-123' },
      });
      expect(result.id).toBe('sub-123');
      expect(result.computedStatus).toBeDefined();
    });

    it('should throw NotFoundException if subscription does not exist', async () => {
      jest.spyOn(subscriptionRepository, 'findOne').mockResolvedValue(null);

      await expect(service.findById('non-existent')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findById('non-existent')).rejects.toThrow(
        'Subscription with id non-existent not found',
      );
    });

    it('should throw InternalServerErrorException on database error', async () => {
      jest
        .spyOn(subscriptionRepository, 'findOne')
        .mockRejectedValue(new Error('Database error'));

      await expect(service.findById('sub-123')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('cancel', () => {
    it('should cancel an ACTIVE subscription', async () => {
      const mockSubscription: Subscription = {
        id: 'sub-123',
        planId: 'plan-123',
        customerId: 'customer-456',
        status: SubscriptionStatus.ACTIVE,
        startDate: new Date('2024-01-01'),
        currentPeriodStart: new Date('2024-01-01'),
        currentPeriodEnd: new Date('2024-02-01'),
        canceledAt: null,
        reactivatedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        plan: mockPlan,
      };

      const canceledSubscription: Subscription = {
        ...mockSubscription,
        status: SubscriptionStatus.CANCELED,
        canceledAt: new Date(),
      };

      jest
        .spyOn(subscriptionRepository, 'findOne')
        .mockResolvedValue(mockSubscription);
      jest
        .spyOn(subscriptionRepository, 'save')
        .mockResolvedValue(canceledSubscription);

      const result = await service.cancel('sub-123');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(subscriptionRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'sub-123' },
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(subscriptionRepository.save).toHaveBeenCalled();
      expect(result.status).toBe(SubscriptionStatus.CANCELED);
      expect(result.computedStatus).toBe(ComputedStatus.CANCELED);
      expect(result.canceledAt).toBeDefined();
      expect(result.canceledAt).not.toBeNull();
    });

    it('should not modify period fields when canceling', async () => {
      const periodStart = new Date('2024-01-01');
      const periodEnd = new Date('2024-02-01');

      const mockSubscription: Subscription = {
        id: 'sub-123',
        planId: 'plan-123',
        customerId: 'customer-456',
        status: SubscriptionStatus.ACTIVE,
        startDate: new Date('2024-01-01'),
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        canceledAt: null,
        reactivatedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        plan: mockPlan,
      };

      const canceledSubscription: Subscription = {
        ...mockSubscription,
        status: SubscriptionStatus.CANCELED,
        canceledAt: new Date(),
      };

      jest
        .spyOn(subscriptionRepository, 'findOne')
        .mockResolvedValue(mockSubscription);
      jest
        .spyOn(subscriptionRepository, 'save')
        .mockResolvedValue(canceledSubscription);

      const result = await service.cancel('sub-123');

      expect(result.currentPeriodStart).toEqual(periodStart);
      expect(result.currentPeriodEnd).toEqual(periodEnd);
    });

    it('should throw ConflictException if subscription is already canceled', async () => {
      const mockSubscription: Subscription = {
        id: 'sub-123',
        planId: 'plan-123',
        customerId: 'customer-456',
        status: SubscriptionStatus.CANCELED,
        startDate: new Date('2024-01-01'),
        currentPeriodStart: new Date('2024-01-01'),
        currentPeriodEnd: new Date('2024-02-01'),
        canceledAt: new Date(),
        reactivatedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        plan: mockPlan,
      };

      jest
        .spyOn(subscriptionRepository, 'findOne')
        .mockResolvedValue(mockSubscription);

      await expect(service.cancel('sub-123')).rejects.toThrow(
        ConflictException,
      );
      await expect(service.cancel('sub-123')).rejects.toThrow(
        'Subscription is already canceled',
      );
    });

    it('should throw NotFoundException if subscription does not exist', async () => {
      jest.spyOn(subscriptionRepository, 'findOne').mockResolvedValue(null);

      await expect(service.cancel('non-existent')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.cancel('non-existent')).rejects.toThrow(
        'Subscription with id non-existent not found',
      );
    });

    it('should throw InternalServerErrorException on database error', async () => {
      const mockSubscription: Subscription = {
        id: 'sub-123',
        planId: 'plan-123',
        customerId: 'customer-456',
        status: SubscriptionStatus.ACTIVE,
        startDate: new Date('2024-01-01'),
        currentPeriodStart: new Date('2024-01-01'),
        currentPeriodEnd: new Date('2024-02-01'),
        canceledAt: null,
        reactivatedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        plan: mockPlan,
      };

      jest
        .spyOn(subscriptionRepository, 'findOne')
        .mockResolvedValue(mockSubscription);
      jest
        .spyOn(subscriptionRepository, 'save')
        .mockRejectedValue(new Error('Database error'));

      await expect(service.cancel('sub-123')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('reactivate', () => {
    it('should reactivate a CANCELED subscription', async () => {
      const canceledSubscription: Subscription = {
        id: 'sub-123',
        planId: 'plan-123',
        customerId: 'customer-456',
        status: SubscriptionStatus.CANCELED,
        startDate: new Date('2024-01-01T00:00:00Z'),
        currentPeriodStart: new Date('2024-01-01T00:00:00Z'),
        currentPeriodEnd: new Date('2024-02-01T00:00:00Z'),
        canceledAt: new Date('2024-01-15T00:00:00Z'),
        reactivatedAt: null,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-15T00:00:00Z'),
        plan: mockPlan,
      };

      jest
        .spyOn(subscriptionRepository, 'findOne')
        .mockResolvedValue(canceledSubscription);

      const reactivatedSubscription: Subscription = {
        ...canceledSubscription,
        status: SubscriptionStatus.ACTIVE,
        reactivatedAt: new Date(),
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
      };

      jest
        .spyOn(subscriptionRepository, 'save')
        .mockResolvedValue(reactivatedSubscription);

      const result = await service.reactivate('sub-123');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(subscriptionRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'sub-123' },
      });

      expect(result.status).toBe(SubscriptionStatus.ACTIVE);
      expect(result.computedStatus).toBe(ComputedStatus.ACTIVE);
      expect(result.reactivatedAt).toBeDefined();
      expect(result.reactivatedAt).not.toBeNull();
      // canceledAt should remain unchanged
      expect(result.canceledAt).toEqual(canceledSubscription.canceledAt);
      // startDate should remain unchanged
      expect(result.startDate).toEqual(canceledSubscription.startDate);
    });

    it('should throw ConflictException if subscription is already ACTIVE', async () => {
      const activeSubscription: Subscription = {
        id: 'sub-123',
        planId: 'plan-123',
        customerId: 'customer-456',
        status: SubscriptionStatus.ACTIVE,
        startDate: new Date('2024-01-01T00:00:00Z'),
        currentPeriodStart: new Date('2024-01-01T00:00:00Z'),
        currentPeriodEnd: new Date('2024-02-01T00:00:00Z'),
        canceledAt: null,
        reactivatedAt: null,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
        plan: mockPlan,
      };

      jest
        .spyOn(subscriptionRepository, 'findOne')
        .mockResolvedValue(activeSubscription);

      await expect(service.reactivate('sub-123')).rejects.toThrow(
        ConflictException,
      );
      await expect(service.reactivate('sub-123')).rejects.toThrow(
        'Subscription is already active',
      );

      // Ensure save was not called
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(subscriptionRepository.save).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if subscription does not exist', async () => {
      jest.spyOn(subscriptionRepository, 'findOne').mockResolvedValue(null);

      await expect(service.reactivate('non-existent')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.reactivate('non-existent')).rejects.toThrow(
        'Subscription with id non-existent not found',
      );
    });

    it('should throw InternalServerErrorException on database error', async () => {
      const canceledSubscription: Subscription = {
        id: 'sub-123',
        planId: 'plan-123',
        customerId: 'customer-456',
        status: SubscriptionStatus.CANCELED,
        startDate: new Date('2024-01-01T00:00:00Z'),
        currentPeriodStart: new Date('2024-01-01T00:00:00Z'),
        currentPeriodEnd: new Date('2024-02-01T00:00:00Z'),
        canceledAt: new Date('2024-01-15T00:00:00Z'),
        reactivatedAt: null,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-15T00:00:00Z'),
        plan: mockPlan,
      };

      jest
        .spyOn(subscriptionRepository, 'findOne')
        .mockResolvedValue(canceledSubscription);

      jest
        .spyOn(subscriptionRepository, 'save')
        .mockRejectedValue(new Error('Database error'));

      await expect(service.reactivate('sub-123')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});
