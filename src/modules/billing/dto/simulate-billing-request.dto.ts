import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsBoolean,
  IsInt,
  Min,
  Max,
} from 'class-validator';

export class SimulateBillingRequestDto {
  @ApiProperty({
    description:
      'Subscription ID to simulate billing for. If not provided, simulates for all eligible subscriptions.',
    required: false,
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsString()
  subscriptionId?: string;

  @ApiProperty({
    description:
      'Maximum number of subscriptions to process when subscriptionId is not specified. Only used when subscriptionId is absent.',
    required: false,
    default: 100,
    minimum: 1,
    maximum: 1000,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxSubscriptions?: number = 100;

  @ApiProperty({
    description:
      'Maximum number of periods to process per subscription to prevent runaway loops on very old subscriptions.',
    required: false,
    default: 12,
    minimum: 1,
    maximum: 60,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  maxPeriodsPerSubscription?: number = 12;

  @ApiProperty({
    description:
      'If true, compute what would happen without writing to the database (preview mode).',
    required: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean = false;
}
