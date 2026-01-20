import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { Subscription, SubscriptionStatus } from './subscription.entity';
import { Plan } from '../plans/plan.entity';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';

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
});
