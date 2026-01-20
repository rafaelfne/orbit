import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  MaxLength,
} from 'class-validator';

export class CreateSubscriptionDto {
  @ApiProperty({
    description: 'Plan ID to subscribe to',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  @IsNotEmpty()
  planId: string;

  @ApiProperty({
    description: 'Customer ID',
    maxLength: 64,
    example: 'customer_123',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  customerId: string;

  @ApiProperty({
    description:
      'Start date of the subscription (ISO 8601 datetime). Defaults to now.',
    required: false,
    example: '2024-01-20T15:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;
}
