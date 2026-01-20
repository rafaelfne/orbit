import { ApiProperty } from '@nestjs/swagger';
import { SubscriptionStatus } from '../subscription.entity';

export class SubscriptionResponseDto {
  @ApiProperty({
    description: 'Subscription ID',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  id: string;

  @ApiProperty({
    description: 'Plan ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  planId: string;

  @ApiProperty({
    description: 'Customer ID',
    example: 'customer_123',
  })
  customerId: string;

  @ApiProperty({
    description: 'Subscription status',
    enum: SubscriptionStatus,
    example: SubscriptionStatus.ACTIVE,
  })
  status: SubscriptionStatus;

  @ApiProperty({
    description: 'Start date of the subscription',
    example: '2024-01-20T15:00:00.000Z',
  })
  startDate: Date;

  @ApiProperty({
    description: 'Current billing period start date',
    example: '2024-01-20T15:00:00.000Z',
  })
  currentPeriodStart: Date;

  @ApiProperty({
    description: 'Current billing period end date',
    example: '2024-02-20T15:00:00.000Z',
  })
  currentPeriodEnd: Date;

  @ApiProperty({
    description: 'Cancellation timestamp (null if not canceled)',
    example: null,
    nullable: true,
  })
  canceledAt: Date | null;

  @ApiProperty({
    description: 'Reactivation timestamp (null if never reactivated)',
    example: null,
    nullable: true,
  })
  reactivatedAt: Date | null;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2024-01-20T15:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2024-01-20T15:00:00.000Z',
  })
  updatedAt: Date;
}
