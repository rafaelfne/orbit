import {
  Injectable,
  Logger,
  InternalServerErrorException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BillingEvent, PaymentStatus } from './billing-event.entity';

export interface CreateBillingEventDto {
  subscriptionId: string;
  periodStart: Date;
  periodEnd: Date;
  amountCents: number;
  currency: string;
  paymentStatus: PaymentStatus;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @InjectRepository(BillingEvent)
    private readonly billingEventRepository: Repository<BillingEvent>,
  ) {}

  /**
   * Create a billing event with idempotency handling.
   * Uses upsert semantics to handle the unique constraint (subscription_id, period_start, period_end).
   * If a billing event already exists for the same subscription and period, it will not create a duplicate.
   */
  async create(dto: CreateBillingEventDto): Promise<BillingEvent> {
    try {
      // Attempt to insert with conflict handling
      const billingEvent = this.billingEventRepository.create(dto);
      const savedEvent = await this.billingEventRepository.save(billingEvent);

      this.logger.log(
        `Billing event created: id=${savedEvent.id}, subscriptionId=${dto.subscriptionId}, period=${dto.periodStart.toISOString()} to ${dto.periodEnd.toISOString()}, amount=${dto.amountCents} ${dto.currency}`,
      );

      return savedEvent;
    } catch (error: unknown) {
      // Handle unique constraint violation (duplicate billing event for same period)
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505'
      ) {
        // Design decision: For idempotency handling, we throw ConflictException rather than
        // silently returning the existing record. This allows the caller (billing simulation service)
        // to decide how to handle duplicates - either as expected idempotent behavior or as an error.
        // The Billing Simulation PRD will define the exact caller-side behavior.
        this.logger.warn(
          `Duplicate billing event attempted: subscriptionId=${dto.subscriptionId}, period=${dto.periodStart.toISOString()} to ${dto.periodEnd.toISOString()}`,
        );
        throw new ConflictException(
          'A billing event for this subscription and period already exists',
        );
      }

      // Handle check constraint violations
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23514'
      ) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(`Check constraint violation: ${errorMessage}`);
        throw new ConflictException(
          `Invalid billing event data: ${errorMessage}`,
        );
      }

      // Handle other database errors
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed to create billing event: ${errorMessage}`,
        errorStack,
      );
      throw new InternalServerErrorException(
        'An error occurred while creating the billing event',
      );
    }
  }

  /**
   * Find all billing events for a subscription, ordered by period_end descending.
   */
  async findBySubscription(subscriptionId: string): Promise<BillingEvent[]> {
    try {
      return await this.billingEventRepository.find({
        where: { subscriptionId },
        order: { periodEnd: 'DESC' },
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed to find billing events for subscription ${subscriptionId}: ${errorMessage}`,
        errorStack,
      );
      throw new InternalServerErrorException(
        'An error occurred while retrieving billing events',
      );
    }
  }
}
