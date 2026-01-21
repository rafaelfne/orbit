import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  Subscription,
  SubscriptionStatus,
} from '../subscriptions/subscription.entity';
import { Plan } from '../plans/plan.entity';
import { PaymentStatus } from './billing-event.entity';
import { BillingService } from './billing.service';
import { SimulateBillingRequestDto } from './dto/simulate-billing-request.dto';
import {
  SimulateBillingResponseDto,
  SubscriptionSimulationResultDto,
} from './dto/simulate-billing-response.dto';
import { ComputedStatus } from '../subscriptions/dto/computed-status.enum';

@Injectable()
export class BillingSimulationService {
  private readonly logger = new Logger(BillingSimulationService.name);

  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
    @InjectRepository(Plan)
    private readonly planRepository: Repository<Plan>,
    private readonly billingService: BillingService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Simulate monthly billing for subscriptions.
   * Creates billing records and advances subscription periods.
   */
  async simulate(
    dto: SimulateBillingRequestDto,
  ): Promise<SimulateBillingResponseDto> {
    this.logger.log(
      `Starting billing simulation: subscriptionId=${String(dto.subscriptionId ?? 'ALL')}, maxSubscriptions=${String(dto.maxSubscriptions ?? 100)}, maxPeriodsPerSubscription=${String(dto.maxPeriodsPerSubscription ?? 12)}, dryRun=${String(dto.dryRun ?? false)}`,
    );

    const subscriptions = await this.getEligibleSubscriptions(
      dto.subscriptionId,

      dto.maxSubscriptions ?? 100,
    );

    const results: SubscriptionSimulationResultDto[] = [];
    let totalBillingRecordsCreated = 0;
    let totalPeriodsAdvanced = 0;

    for (const subscription of subscriptions) {
      const result = await this.simulateForSubscription(
        subscription,

        dto.maxPeriodsPerSubscription ?? 12,

        dto.dryRun ?? false,
      );

      results.push(result);
      totalBillingRecordsCreated += result.billingRecordsCreated;
      totalPeriodsAdvanced += result.periodsProcessed;
    }

    this.logger.log(
      `Billing simulation completed: processedSubscriptions=${results.length}, createdBillingRecords=${totalBillingRecordsCreated}, advancedPeriods=${totalPeriodsAdvanced}`,
    );

    return {
      processedSubscriptions: results.length,
      createdBillingRecords: totalBillingRecordsCreated,
      advancedPeriods: totalPeriodsAdvanced,
      results,
    };
  }

  /**
   * Get eligible subscriptions for billing simulation.
   * Only returns ACTIVE subscriptions where current_period_end has passed.
   */
  private async getEligibleSubscriptions(
    subscriptionId?: string,
    maxSubscriptions?: number,
  ): Promise<Subscription[]> {
    try {
      const now = new Date();

      if (subscriptionId) {
        // Single subscription case
        const subscription = await this.subscriptionRepository.findOne({
          where: { id: subscriptionId },
          relations: ['plan'],
        });

        if (!subscription) {
          throw new NotFoundException(
            `Subscription with id ${subscriptionId} not found`,
          );
        }

        // Only return if eligible (ACTIVE status)
        if (subscription.status === SubscriptionStatus.ACTIVE) {
          return [subscription];
        }

        return [];
      }

      // Multiple subscriptions case
      const queryBuilder = this.subscriptionRepository
        .createQueryBuilder('subscription')
        .leftJoinAndSelect('subscription.plan', 'plan')
        .where('subscription.status = :status', {
          status: SubscriptionStatus.ACTIVE,
        })
        .andWhere('subscription.currentPeriodEnd <= :now', { now })
        .orderBy('subscription.currentPeriodEnd', 'ASC')
        .take(maxSubscriptions);

      return await queryBuilder.getMany();
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed to get eligible subscriptions: ${errorMessage}`,
        errorStack,
      );
      throw new InternalServerErrorException(
        'An error occurred while retrieving eligible subscriptions',
      );
    }
  }

  /**
   * Simulate billing for a single subscription.
   * Processes all elapsed periods and advances the subscription period.
   */
  private async simulateForSubscription(
    subscription: Subscription,
    maxPeriodsPerSubscription: number,
    dryRun: boolean,
  ): Promise<SubscriptionSimulationResultDto> {
    const periodStartBefore = new Date(subscription.currentPeriodStart);
    const periodEndBefore = new Date(subscription.currentPeriodEnd);

    let periodsProcessed = 0;
    let billingRecordsCreated = 0;
    let hitMaxPeriodsLimit = false;

    // Get plan for pricing
    const plan =
      subscription.plan ??
      (await this.planRepository.findOne({
        where: { id: subscription.planId },
      }));

    if (!plan) {
      this.logger.error(
        `Plan not found for subscription ${subscription.id}, planId=${subscription.planId}`,
      );
      throw new InternalServerErrorException(
        `Plan not found for subscription ${subscription.id}`,
      );
    }

    if (dryRun) {
      // Dry run: compute what would happen without DB writes
      const result = this.simulateDryRun(
        subscription,
        plan,
        maxPeriodsPerSubscription,
      );

      return {
        subscriptionId: subscription.id,
        periodsProcessed: result.periodsProcessed,
        billingRecordsCreated: result.billingRecordsCreated,
        periodStartBefore,
        periodEndBefore,
        periodStartAfter: result.periodStartAfter,
        periodEndAfter: result.periodEndAfter,
        statusAfter: subscription.status,
        computedStatusAfter: this.computeStatus(subscription),
        hitMaxPeriodsLimit: result.hitMaxPeriodsLimit,
      };
    }

    // Real run: perform DB operations within a transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const now = new Date();
      let currentPeriodStart = new Date(subscription.currentPeriodStart);
      let currentPeriodEnd = new Date(subscription.currentPeriodEnd);

      // Process all elapsed periods
      while (
        now >= currentPeriodEnd &&
        periodsProcessed < maxPeriodsPerSubscription
      ) {
        try {
          // Create billing event for this period
          await this.billingService.create({
            subscriptionId: subscription.id,
            periodStart: currentPeriodStart,
            periodEnd: currentPeriodEnd,
            amountCents: plan.priceCents,
            currency: plan.currency,
            paymentStatus: PaymentStatus.PAID, // Using Option A: always PAID
          });

          billingRecordsCreated++;
        } catch (error: unknown) {
          // If it's a conflict error (duplicate billing event), it's expected for idempotency
          // Continue to period advancement
          if (
            error &&
            typeof error === 'object' &&
            'message' in error &&
            typeof error.message === 'string' &&
            error.message.includes('already exists')
          ) {
            this.logger.debug(
              `Billing event already exists for subscription ${subscription.id}, period ${currentPeriodStart.toISOString()} to ${currentPeriodEnd.toISOString()} - skipping`,
            );
          } else {
            // Re-throw other errors
            throw error;
          }
        }

        // Advance period by one month
        currentPeriodStart = new Date(currentPeriodEnd);
        currentPeriodEnd = this.addOneMonth(currentPeriodEnd);
        periodsProcessed++;
      }

      // Check if we hit the limit
      if (
        periodsProcessed >= maxPeriodsPerSubscription &&
        now >= currentPeriodEnd
      ) {
        hitMaxPeriodsLimit = true;
        this.logger.warn(
          `Hit maxPeriodsPerSubscription limit for subscription ${subscription.id}. Processed ${periodsProcessed} periods.`,
        );
      }

      // Update subscription with new period
      await queryRunner.manager.update(
        Subscription,
        { id: subscription.id },
        {
          currentPeriodStart,
          currentPeriodEnd,
        },
      );

      await queryRunner.commitTransaction();

      // Update in-memory subscription for status computation
      subscription.currentPeriodStart = currentPeriodStart;
      subscription.currentPeriodEnd = currentPeriodEnd;

      this.logger.log(
        `Billing simulation for subscription ${subscription.id}: periodsProcessed=${periodsProcessed}, billingRecordsCreated=${billingRecordsCreated}, newPeriod=${currentPeriodStart.toISOString()} to ${currentPeriodEnd.toISOString()}`,
      );

      return {
        subscriptionId: subscription.id,
        periodsProcessed,
        billingRecordsCreated,
        periodStartBefore,
        periodEndBefore,
        periodStartAfter: currentPeriodStart,
        periodEndAfter: currentPeriodEnd,
        statusAfter: subscription.status,
        computedStatusAfter: this.computeStatus(subscription),
        hitMaxPeriodsLimit,
      };
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed to simulate billing for subscription ${subscription.id}: ${errorMessage}`,
        errorStack,
      );
      throw new InternalServerErrorException(
        `An error occurred while simulating billing for subscription ${subscription.id}`,
      );
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Simulate billing for a subscription in dry run mode (no DB writes).
   */
  private simulateDryRun(
    subscription: Subscription,
    plan: Plan,
    maxPeriodsPerSubscription: number,
  ): {
    periodsProcessed: number;
    billingRecordsCreated: number;
    periodStartAfter: Date;
    periodEndAfter: Date;
    hitMaxPeriodsLimit: boolean;
  } {
    const now = new Date();
    let currentPeriodStart = new Date(subscription.currentPeriodStart);
    let currentPeriodEnd = new Date(subscription.currentPeriodEnd);
    let periodsProcessed = 0;

    // Simulate period advancement
    while (
      now >= currentPeriodEnd &&
      periodsProcessed < maxPeriodsPerSubscription
    ) {
      currentPeriodStart = new Date(currentPeriodEnd);
      currentPeriodEnd = this.addOneMonth(currentPeriodEnd);
      periodsProcessed++;
    }

    const hitMaxPeriodsLimit =
      periodsProcessed >= maxPeriodsPerSubscription && now >= currentPeriodEnd;

    return {
      periodsProcessed,
      billingRecordsCreated: periodsProcessed, // In dry run, assume all would be created
      periodStartAfter: currentPeriodStart,
      periodEndAfter: currentPeriodEnd,
      hitMaxPeriodsLimit,
    };
  }

  /**
   * Add one month to a date, handling month boundaries correctly.
   */
  private addOneMonth(date: Date): Date {
    const result = new Date(date);
    result.setMonth(result.getMonth() + 1);
    return result;
  }

  /**
   * Compute the derived status for a subscription.
   * Simplified version - does not check billing events yet.
   */
  private computeStatus(subscription: Subscription): ComputedStatus {
    if (subscription.status === SubscriptionStatus.CANCELED) {
      return ComputedStatus.CANCELED;
    }

    const now = new Date();
    const periodEnd = new Date(subscription.currentPeriodEnd);

    if (periodEnd >= now) {
      return ComputedStatus.ACTIVE;
    }

    return ComputedStatus.OVERDUE;
  }
}
