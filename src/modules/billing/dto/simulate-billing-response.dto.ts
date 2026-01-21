import { ApiProperty } from '@nestjs/swagger';

export class SubscriptionSimulationResultDto {
  @ApiProperty({
    description: 'Subscription ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  subscriptionId: string;

  @ApiProperty({
    description: 'Number of periods processed for this subscription',
    example: 3,
  })
  periodsProcessed: number;

  @ApiProperty({
    description: 'Number of billing records created for this subscription',
    example: 3,
  })
  billingRecordsCreated: number;

  @ApiProperty({
    description: 'Period start before simulation',
    example: '2024-01-01T00:00:00.000Z',
  })
  periodStartBefore: Date;

  @ApiProperty({
    description: 'Period end before simulation',
    example: '2024-02-01T00:00:00.000Z',
  })
  periodEndBefore: Date;

  @ApiProperty({
    description: 'Period start after simulation',
    example: '2024-04-01T00:00:00.000Z',
  })
  periodStartAfter: Date;

  @ApiProperty({
    description: 'Period end after simulation',
    example: '2024-05-01T00:00:00.000Z',
  })
  periodEndAfter: Date;

  @ApiProperty({
    description: 'Persisted status after simulation',
    example: 'ACTIVE',
  })
  statusAfter: string;

  @ApiProperty({
    description: 'Computed status after simulation',
    example: 'ACTIVE',
  })
  computedStatusAfter: string;

  @ApiProperty({
    description:
      'Whether the processing was stopped due to reaching maxPeriodsPerSubscription limit',
    example: false,
  })
  hitMaxPeriodsLimit: boolean;
}

export class SimulateBillingResponseDto {
  @ApiProperty({
    description: 'Total number of subscriptions processed',
    example: 5,
  })
  processedSubscriptions: number;

  @ApiProperty({
    description:
      'Total number of billing records created across all subscriptions',
    example: 15,
  })
  createdBillingRecords: number;

  @ApiProperty({
    description: 'Total number of periods advanced across all subscriptions',
    example: 15,
  })
  advancedPeriods: number;

  @ApiProperty({
    description: 'Detailed results for each processed subscription',
    type: [SubscriptionSimulationResultDto],
  })
  results: SubscriptionSimulationResultDto[];
}
