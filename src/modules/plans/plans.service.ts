import {
  Injectable,
  ConflictException,
  Logger,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { Plan } from './plan.entity';
import { FxRate } from './fx-rate.entity';
import { CreatePlanDto } from './dto/create-plan.dto';
import { PlanWithFxDto, FxMetadataDto } from './dto/plan-with-fx.dto';
import { PaginatedPlansResponseDto } from './dto/paginated-plans-response.dto';

@Injectable()
export class PlansService {
  private readonly logger = new Logger(PlansService.name);

  constructor(
    @InjectRepository(Plan)
    private readonly planRepository: Repository<Plan>,
    @InjectRepository(FxRate)
    private readonly fxRateRepository: Repository<FxRate>,
  ) {}

  async create(createPlanDto: CreatePlanDto): Promise<Plan> {
    const { name, priceCents, currency, interval = 'MONTHLY' } = createPlanDto;

    try {
      const plan = this.planRepository.create({
        name,
        priceCents,
        currency,
        interval,
      });

      const savedPlan = await this.planRepository.save(plan);

      this.logger.log(
        `Plan created: id=${savedPlan.id}, name=${savedPlan.name}, currency=${savedPlan.currency}`,
      );

      return savedPlan;
    } catch (error: unknown) {
      // Handle unique constraint violation (duplicate name)
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505'
      ) {
        this.logger.warn(
          `Duplicate plan name attempted: name=${name}, currency=${currency}`,
        );
        throw new ConflictException('A plan with this name already exists');
      }

      // Handle other database errors
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to create plan: ${errorMessage}`, errorStack);
      throw new InternalServerErrorException(
        'An error occurred while creating the plan',
      );
    }
  }

  async findAll(
    page: number = 1,
    pageSize: number = 20,
    currency?: string,
  ): Promise<PaginatedPlansResponseDto> {
    try {
      // Calculate offset
      const skip = (page - 1) * pageSize;

      // Fetch plans with pagination, ordered by createdAt DESC
      const [plans, total] = await this.planRepository.findAndCount({
        order: { createdAt: 'DESC' },
        skip,
        take: pageSize,
      });

      // Apply currency conversion if requested
      const items = await Promise.all(
        plans.map((plan) => this.applyConversion(plan, currency)),
      );

      return {
        items,
        page,
        pageSize,
        total,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to list plans: ${errorMessage}`, errorStack);

      // Re-throw if it's already an HTTP exception (e.g., from conversion)
      if (
        error instanceof UnprocessableEntityException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      throw new InternalServerErrorException(
        'An error occurred while listing plans',
      );
    }
  }

  async findById(id: string, currency?: string): Promise<PlanWithFxDto> {
    try {
      const plan = await this.planRepository.findOne({ where: { id } });

      if (!plan) {
        throw new NotFoundException(`Plan with id ${id} not found`);
      }

      return this.applyConversion(plan, currency);
    } catch (error: unknown) {
      // Re-throw if it's already an HTTP exception
      if (
        error instanceof NotFoundException ||
        error instanceof UnprocessableEntityException
      ) {
        throw error;
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed to get plan by id: ${errorMessage}`,
        errorStack,
      );
      throw new InternalServerErrorException(
        'An error occurred while fetching the plan',
      );
    }
  }

  private async applyConversion(
    plan: Plan,
    currency?: string,
  ): Promise<PlanWithFxDto> {
    // If no currency requested or same as plan currency, return as-is
    if (!currency || currency === plan.currency) {
      return {
        id: plan.id,
        name: plan.name,
        priceCents: plan.priceCents,
        currency: plan.currency,
        interval: plan.interval,
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt,
      };
    }

    // Find the latest FX rate
    const fxRate = await this.fxRateRepository.findOne({
      where: {
        baseCurrency: plan.currency,
        quoteCurrency: currency,
        asOf: LessThanOrEqual(new Date()),
      },
      order: {
        asOf: 'DESC',
      },
    });

    if (!fxRate) {
      throw new UnprocessableEntityException(
        `No exchange rate found for ${plan.currency} to ${currency}`,
      );
    }

    // Convert price using money-safe arithmetic
    const rate = parseFloat(fxRate.rate);
    const convertedPriceCents = Math.round(plan.priceCents * rate);

    const fxMetadata: FxMetadataDto = {
      baseCurrency: plan.currency,
      quoteCurrency: currency,
      rate: fxRate.rate,
      asOf: fxRate.asOf,
      originalPriceCents: plan.priceCents,
    };

    return {
      id: plan.id,
      name: plan.name,
      priceCents: convertedPriceCents,
      currency: currency,
      interval: plan.interval,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
      fx: fxMetadata,
    };
  }
}
