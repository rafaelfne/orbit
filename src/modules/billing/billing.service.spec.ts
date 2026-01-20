import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingEvent, PaymentStatus } from './billing-event.entity';

describe('BillingService', () => {
  let service: BillingService;
  let billingEventRepository: Repository<BillingEvent>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        {
          provide: getRepositoryToken(BillingEvent),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<BillingService>(BillingService);
    billingEventRepository = module.get<Repository<BillingEvent>>(
      getRepositoryToken(BillingEvent),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createDto = {
      subscriptionId: 'sub-123',
      periodStart: new Date('2024-01-01T00:00:00Z'),
      periodEnd: new Date('2024-02-01T00:00:00Z'),
      amountCents: 9900,
      currency: 'USD',
      paymentStatus: PaymentStatus.PAID,
    };

    it('should create a billing event successfully', async () => {
      const mockBillingEvent: BillingEvent = {
        id: 'billing-123',
        subscriptionId: createDto.subscriptionId,
        periodStart: createDto.periodStart,
        periodEnd: createDto.periodEnd,
        amountCents: createDto.amountCents,
        currency: createDto.currency,
        paymentStatus: createDto.paymentStatus,
        createdAt: new Date(),
        updatedAt: new Date(),
        subscription: null as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      };

      jest
        .spyOn(billingEventRepository, 'create')
        .mockReturnValue(mockBillingEvent);
      jest
        .spyOn(billingEventRepository, 'save')
        .mockResolvedValue(mockBillingEvent);

      const result = await service.create(createDto);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(billingEventRepository.create).toHaveBeenCalledWith(createDto);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(billingEventRepository.save).toHaveBeenCalled();
      expect(result).toEqual(mockBillingEvent);
      expect(result.subscriptionId).toBe(createDto.subscriptionId);
      expect(result.amountCents).toBe(createDto.amountCents);
    });

    it('should throw ConflictException for duplicate billing event (same subscription and period)', async () => {
      jest
        .spyOn(billingEventRepository, 'create')
        .mockReturnValue({} as BillingEvent);

      const dbError = {
        code: '23505', // PostgreSQL unique constraint violation
        detail:
          'Key (subscription_id, period_start, period_end)=(sub-123, 2024-01-01, 2024-02-01) already exists.',
      };
      jest.spyOn(billingEventRepository, 'save').mockRejectedValue(dbError);

      await expect(service.create(createDto)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.create(createDto)).rejects.toThrow(
        'A billing event for this subscription and period already exists',
      );
    });

    it('should throw ConflictException for check constraint violation (negative amount)', async () => {
      jest
        .spyOn(billingEventRepository, 'create')
        .mockReturnValue({} as BillingEvent);

      const dbError = {
        code: '23514', // PostgreSQL check constraint violation
        message: 'violates check constraint "chk_amount_non_negative"',
      };
      jest.spyOn(billingEventRepository, 'save').mockRejectedValue(dbError);

      await expect(service.create(createDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException for check constraint violation (period_end <= period_start)', async () => {
      const invalidDto = {
        ...createDto,
        periodEnd: new Date('2023-12-01T00:00:00Z'), // Before periodStart
      };

      jest
        .spyOn(billingEventRepository, 'create')
        .mockReturnValue({} as BillingEvent);

      const dbError = {
        code: '23514', // PostgreSQL check constraint violation
        message: 'violates check constraint "chk_period_end_after_start"',
      };
      jest.spyOn(billingEventRepository, 'save').mockRejectedValue(dbError);

      await expect(service.create(invalidDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw InternalServerErrorException for unknown database errors', async () => {
      jest
        .spyOn(billingEventRepository, 'create')
        .mockReturnValue({} as BillingEvent);

      const dbError = new Error('Database connection lost');
      jest.spyOn(billingEventRepository, 'save').mockRejectedValue(dbError);

      await expect(service.create(createDto)).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(service.create(createDto)).rejects.toThrow(
        'An error occurred while creating the billing event',
      );
    });
  });

  describe('findBySubscription', () => {
    const subscriptionId = 'sub-123';

    it('should return billing events for a subscription ordered by period_end DESC', async () => {
      const mockBillingEvents: BillingEvent[] = [
        {
          id: 'billing-2',
          subscriptionId,
          periodStart: new Date('2024-02-01T00:00:00Z'),
          periodEnd: new Date('2024-03-01T00:00:00Z'),
          amountCents: 9900,
          currency: 'USD',
          paymentStatus: PaymentStatus.PAID,
          createdAt: new Date(),
          updatedAt: new Date(),
          subscription: null as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        },
        {
          id: 'billing-1',
          subscriptionId,
          periodStart: new Date('2024-01-01T00:00:00Z'),
          periodEnd: new Date('2024-02-01T00:00:00Z'),
          amountCents: 9900,
          currency: 'USD',
          paymentStatus: PaymentStatus.PAID,
          createdAt: new Date(),
          updatedAt: new Date(),
          subscription: null as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        },
      ];

      jest
        .spyOn(billingEventRepository, 'find')
        .mockResolvedValue(mockBillingEvents);

      const result = await service.findBySubscription(subscriptionId);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(billingEventRepository.find).toHaveBeenCalledWith({
        where: { subscriptionId },
        order: { periodEnd: 'DESC' },
      });
      expect(result).toEqual(mockBillingEvents);
      expect(result.length).toBe(2);
      expect(result[0].id).toBe('billing-2'); // Most recent first
    });

    it('should return empty array if no billing events exist', async () => {
      jest.spyOn(billingEventRepository, 'find').mockResolvedValue([]);

      const result = await service.findBySubscription(subscriptionId);

      expect(result).toEqual([]);
    });

    it('should throw InternalServerErrorException on database error', async () => {
      jest
        .spyOn(billingEventRepository, 'find')
        .mockRejectedValue(new Error('Database error'));

      await expect(service.findBySubscription(subscriptionId)).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(service.findBySubscription(subscriptionId)).rejects.toThrow(
        'An error occurred while retrieving billing events',
      );
    });
  });
});
