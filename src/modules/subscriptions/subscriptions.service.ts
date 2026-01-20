import {
  Injectable,
  ConflictException,
  Logger,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscription, SubscriptionStatus } from './subscription.entity';
import { Plan } from '../plans/plan.entity';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { SubscriptionResponseDto } from './dto/subscription-response.dto';
import { ComputedStatus } from './dto/computed-status.enum';
import { PaginatedSubscriptionsResponseDto } from './dto/paginated-subscriptions-response.dto';

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
    @InjectRepository(Plan)
    private readonly planRepository: Repository<Plan>,
  ) {}

  async create(
    createSubscriptionDto: CreateSubscriptionDto,
  ): Promise<SubscriptionResponseDto> {
    const { planId, customerId, startDate } = createSubscriptionDto;

    try {
      // 1. Validate plan existence
      const plan = await this.planRepository.findOne({ where: { id: planId } });
      if (!plan) {
        throw new NotFoundException(`Plan with id ${planId} not found`);
      }

      // 2. Prepare dates
      const start = startDate ? new Date(startDate) : new Date();
      const periodStart = start;
      const periodEnd = this.addOneMonth(periodStart);

      // 3. Create subscription
      const subscription = this.subscriptionRepository.create({
        planId,
        customerId,
        status: SubscriptionStatus.ACTIVE,
        startDate: start,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        canceledAt: null,
        reactivatedAt: null,
      });

      const savedSubscription =
        await this.subscriptionRepository.save(subscription);

      this.logger.log(
        `Subscription created: id=${savedSubscription.id}, planId=${planId}, customerId=${customerId}, periodStart=${periodStart.toISOString()}, periodEnd=${periodEnd.toISOString()}`,
      );

      return this.toResponseDto(savedSubscription);
    } catch (error: unknown) {
      // Re-throw if it's already an HTTP exception
      if (error instanceof NotFoundException) {
        throw error;
      }

      // Handle unique constraint violation (duplicate ACTIVE subscription for same customer+plan)
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505'
      ) {
        this.logger.warn(
          `Duplicate ACTIVE subscription attempted: customerId=${customerId}, planId=${planId}`,
        );
        throw new ConflictException(
          'An active subscription for this customer and plan already exists',
        );
      }

      // Handle other database errors
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed to create subscription: ${errorMessage}`,
        errorStack,
      );
      throw new InternalServerErrorException(
        'An error occurred while creating the subscription',
      );
    }
  }

  async findAll(
    page: number = 1,
    pageSize: number = 20,
    customerId?: string,
  ): Promise<PaginatedSubscriptionsResponseDto> {
    try {
      const skip = (page - 1) * pageSize;
      const take = pageSize;

      // Build query
      const queryBuilder = this.subscriptionRepository
        .createQueryBuilder('subscription')
        .orderBy('subscription.createdAt', 'DESC')
        .skip(skip)
        .take(take);

      // Apply customerId filter if provided
      if (customerId) {
        queryBuilder.where('subscription.customerId = :customerId', {
          customerId,
        });
      }

      // Execute query
      const [subscriptions, total] = await queryBuilder.getManyAndCount();

      // Convert to response DTOs with computed status
      const items = subscriptions.map((subscription) =>
        this.toResponseDto(subscription),
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
      this.logger.error(
        `Failed to list subscriptions: ${errorMessage}`,
        errorStack,
      );
      throw new InternalServerErrorException(
        'An error occurred while listing subscriptions',
      );
    }
  }

  async findById(id: string): Promise<SubscriptionResponseDto> {
    try {
      const subscription = await this.subscriptionRepository.findOne({
        where: { id },
      });

      if (!subscription) {
        throw new NotFoundException(`Subscription with id ${id} not found`);
      }

      return this.toResponseDto(subscription);
    } catch (error: unknown) {
      // Re-throw if it's already an HTTP exception
      if (error instanceof NotFoundException) {
        throw error;
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed to get subscription: ${errorMessage}`,
        errorStack,
      );
      throw new InternalServerErrorException(
        'An error occurred while getting the subscription',
      );
    }
  }

  private addOneMonth(date: Date): Date {
    const result = new Date(date);
    // Add one month, handling month boundaries correctly
    result.setMonth(result.getMonth() + 1);
    return result;
  }

  private computeStatus(subscription: Subscription): ComputedStatus {
    // If subscription is canceled, return CANCELED
    if (subscription.status === SubscriptionStatus.CANCELED) {
      return ComputedStatus.CANCELED;
    }

    // For ACTIVE subscriptions, check if period has ended
    const now = new Date();
    const periodEnd = new Date(subscription.currentPeriodEnd);

    // If current period has not ended, subscription is ACTIVE
    if (periodEnd >= now) {
      return ComputedStatus.ACTIVE;
    }

    // Period has ended - since no billing entity exists yet,
    // treat as OVERDUE (no payment for expired period)
    // This follows Option A from the PRD: treat as missing payment => OVERDUE
    return ComputedStatus.OVERDUE;
  }

  private toResponseDto(subscription: Subscription): SubscriptionResponseDto {
    return {
      id: subscription.id,
      planId: subscription.planId,
      customerId: subscription.customerId,
      status: subscription.status,
      computedStatus: this.computeStatus(subscription),
      startDate: subscription.startDate,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      canceledAt: subscription.canceledAt,
      reactivatedAt: subscription.reactivatedAt,
      createdAt: subscription.createdAt,
      updatedAt: subscription.updatedAt,
    };
  }
}
