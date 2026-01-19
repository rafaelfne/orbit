import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PlansService } from './plans.service';
import { Plan } from './plan.entity';
import { CreatePlanDto } from './dto/create-plan.dto';

describe('PlansService', () => {
  let service: PlansService;

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlansService,
        {
          provide: getRepositoryToken(Plan),
          useValue: mockRepository,
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

      mockRepository.create.mockReturnValue(expectedPlan);
      mockRepository.save.mockResolvedValue(expectedPlan);

      const result = await service.create(createPlanDto);

      expect(result).toEqual(expectedPlan);
      expect(mockRepository.create).toHaveBeenCalledWith({
        name: 'Premium Plan',
        priceCents: 9900,
        currency: 'USD',
        interval: 'MONTHLY',
      });
      expect(mockRepository.save).toHaveBeenCalledWith(expectedPlan);
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

      mockRepository.create.mockReturnValue(expectedPlan);
      mockRepository.save.mockResolvedValue(expectedPlan);

      const result = await service.create(createPlanDto);

      expect(result.interval).toBe('MONTHLY');
    });

    it('should throw ConflictException on duplicate name', async () => {
      const createPlanDto: CreatePlanDto = {
        name: 'Duplicate Plan',
        priceCents: 9900,
        currency: 'USD',
      };

      mockRepository.create.mockReturnValue(createPlanDto);
      mockRepository.save.mockRejectedValue({ code: '23505' });

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

      mockRepository.create.mockReturnValue(createPlanDto);
      mockRepository.save.mockRejectedValue(
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
});
