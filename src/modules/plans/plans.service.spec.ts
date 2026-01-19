import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PlansService } from './plans.service';
import { Plan } from './plan.entity';
import { FxRate } from './fx-rate.entity';
import { CreatePlanDto } from './dto/create-plan.dto';

describe('PlansService', () => {
  let service: PlansService;

  const mockPlanRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findAndCount: jest.fn(),
    findOne: jest.fn(),
  };

  const mockFxRateRepository = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlansService,
        {
          provide: getRepositoryToken(Plan),
          useValue: mockPlanRepository,
        },
        {
          provide: getRepositoryToken(FxRate),
          useValue: mockFxRateRepository,
        },
      ],
    }).compile();

    service = module.get<PlansService>(PlansService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a plan successfully', async () => {
      const createPlanDto: CreatePlanDto = {
        name: 'Premium Plan',
        priceCents: 9900,
        currency: 'USD',
      };

      const expectedPlan = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Premium Plan',
        priceCents: 9900,
        currency: 'USD',
        interval: 'MONTHLY',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPlanRepository.create.mockReturnValue(expectedPlan);
      mockPlanRepository.save.mockResolvedValue(expectedPlan);

      const result = await service.create(createPlanDto);

      expect(result).toEqual(expectedPlan);
      expect(mockPlanRepository.create).toHaveBeenCalledWith({
        name: 'Premium Plan',
        priceCents: 9900,
        currency: 'USD',
        interval: 'MONTHLY',
      });
      expect(mockPlanRepository.save).toHaveBeenCalledWith(expectedPlan);
    });

    it('should use MONTHLY as default interval', async () => {
      const createPlanDto: CreatePlanDto = {
        name: 'Basic Plan',
        priceCents: 4900,
        currency: 'BRL',
      };

      const expectedPlan = {
        id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'Basic Plan',
        priceCents: 4900,
        currency: 'BRL',
        interval: 'MONTHLY',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPlanRepository.create.mockReturnValue(expectedPlan);
      mockPlanRepository.save.mockResolvedValue(expectedPlan);

      const result = await service.create(createPlanDto);

      expect(result.interval).toBe('MONTHLY');
    });

    it('should throw ConflictException on duplicate name', async () => {
      const createPlanDto: CreatePlanDto = {
        name: 'Duplicate Plan',
        priceCents: 9900,
        currency: 'USD',
      };

      mockPlanRepository.create.mockReturnValue(createPlanDto);
      mockPlanRepository.save.mockRejectedValue({ code: '23505' });

      await expect(service.create(createPlanDto)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.create(createPlanDto)).rejects.toThrow(
        'A plan with this name already exists',
      );
    });

    it('should throw InternalServerErrorException on other database errors', async () => {
      const createPlanDto: CreatePlanDto = {
        name: 'Test Plan',
        priceCents: 9900,
        currency: 'USD',
      };

      mockPlanRepository.create.mockReturnValue(createPlanDto);
      mockPlanRepository.save.mockRejectedValue(
        new Error('Database connection error'),
      );

      await expect(service.create(createPlanDto)).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(service.create(createPlanDto)).rejects.toThrow(
        'An error occurred while creating the plan',
      );
    });
  });

  describe('findAll', () => {
    const mockPlans = [
      {
        id: '1',
        name: 'Plan 1',
        priceCents: 1000,
        currency: 'USD',
        interval: 'MONTHLY',
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      },
      {
        id: '2',
        name: 'Plan 2',
        priceCents: 2000,
        currency: 'USD',
        interval: 'MONTHLY',
        createdAt: new Date('2026-01-02'),
        updatedAt: new Date('2026-01-02'),
      },
    ];

    it('should return paginated plans without currency conversion', async () => {
      mockPlanRepository.findAndCount.mockResolvedValue([mockPlans, 2]);

      const result = await service.findAll(1, 20);

      expect(result).toEqual({
        items: mockPlans,
        page: 1,
        pageSize: 20,
        total: 2,
      });
      expect(mockPlanRepository.findAndCount).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
        skip: 0,
        take: 20,
      });
    });

    it('should handle pagination correctly', async () => {
      mockPlanRepository.findAndCount.mockResolvedValue([[mockPlans[1]], 10]);

      const result = await service.findAll(2, 5);

      expect(result.page).toBe(2);
      expect(result.pageSize).toBe(5);
      expect(result.total).toBe(10);
      expect(mockPlanRepository.findAndCount).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
        skip: 5,
        take: 5,
      });
    });

    it('should apply currency conversion when requested', async () => {
      const planInUSD = {
        id: '1',
        name: 'Plan USD',
        priceCents: 10000,
        currency: 'USD',
        interval: 'MONTHLY',
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      };

      const fxRate = {
        id: 'fx1',
        baseCurrency: 'USD',
        quoteCurrency: 'BRL',
        rate: '5.25',
        asOf: new Date('2026-01-01'),
        createdAt: new Date('2026-01-01'),
      };

      mockPlanRepository.findAndCount.mockResolvedValue([[planInUSD], 1]);
      mockFxRateRepository.findOne.mockResolvedValue(fxRate);

      const result = await service.findAll(1, 20, 'BRL');

      expect(result.items[0].priceCents).toBe(52500); // 10000 * 5.25
      expect(result.items[0].currency).toBe('BRL');
      expect(result.items[0].fx).toEqual({
        baseCurrency: 'USD',
        quoteCurrency: 'BRL',
        rate: '5.25',
        asOf: fxRate.asOf,
        originalPriceCents: 10000,
      });
    });

    it('should not convert when currency is same as plan currency', async () => {
      const planInUSD = {
        id: '1',
        name: 'Plan USD',
        priceCents: 10000,
        currency: 'USD',
        interval: 'MONTHLY',
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      };

      mockPlanRepository.findAndCount.mockResolvedValue([[planInUSD], 1]);

      const result = await service.findAll(1, 20, 'USD');

      expect(result.items[0].priceCents).toBe(10000);
      expect(result.items[0].currency).toBe('USD');
      expect(result.items[0].fx).toBeUndefined();
      expect(mockFxRateRepository.findOne).not.toHaveBeenCalled();
    });

    it('should throw UnprocessableEntityException when FX rate not found', async () => {
      const planInUSD = {
        id: '1',
        name: 'Plan USD',
        priceCents: 10000,
        currency: 'USD',
        interval: 'MONTHLY',
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      };

      mockPlanRepository.findAndCount.mockResolvedValue([[planInUSD], 1]);
      mockFxRateRepository.findOne.mockResolvedValue(null);

      await expect(service.findAll(1, 20, 'BRL')).rejects.toThrow(
        UnprocessableEntityException,
      );
      await expect(service.findAll(1, 20, 'BRL')).rejects.toThrow(
        'No exchange rate found for USD to BRL',
      );
    });
  });

  describe('findById', () => {
    const mockPlan = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Premium Plan',
      priceCents: 9900,
      currency: 'USD',
      interval: 'MONTHLY',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should return a plan without currency conversion', async () => {
      mockPlanRepository.findOne.mockResolvedValue(mockPlan);

      const result = await service.findById(mockPlan.id);

      expect(result).toEqual(mockPlan);
      expect(mockPlanRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockPlan.id },
      });
    });

    it('should throw NotFoundException when plan not found', async () => {
      mockPlanRepository.findOne.mockResolvedValue(null);

      await expect(service.findById('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findById('non-existent-id')).rejects.toThrow(
        'Plan with id non-existent-id not found',
      );
    });

    it('should apply currency conversion when requested', async () => {
      const fxRate = {
        id: 'fx1',
        baseCurrency: 'USD',
        quoteCurrency: 'BRL',
        rate: '5.25',
        asOf: new Date('2026-01-01'),
        createdAt: new Date('2026-01-01'),
      };

      mockPlanRepository.findOne.mockResolvedValue(mockPlan);
      mockFxRateRepository.findOne.mockResolvedValue(fxRate);

      const result = await service.findById(mockPlan.id, 'BRL');

      expect(result.priceCents).toBe(51975); // 9900 * 5.25
      expect(result.currency).toBe('BRL');
      expect(result.fx).toEqual({
        baseCurrency: 'USD',
        quoteCurrency: 'BRL',
        rate: '5.25',
        asOf: fxRate.asOf,
        originalPriceCents: 9900,
      });
    });

    it('should throw UnprocessableEntityException when FX rate not found', async () => {
      mockPlanRepository.findOne.mockResolvedValue(mockPlan);
      mockFxRateRepository.findOne.mockResolvedValue(null);

      await expect(service.findById(mockPlan.id, 'BRL')).rejects.toThrow(
        UnprocessableEntityException,
      );
      await expect(service.findById(mockPlan.id, 'BRL')).rejects.toThrow(
        'No exchange rate found for USD to BRL',
      );
    });
  });
});
