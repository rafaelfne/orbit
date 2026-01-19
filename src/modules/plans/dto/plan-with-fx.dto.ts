import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FxMetadataDto {
  @ApiProperty({
    description: 'Original currency of the plan',
    example: 'USD',
  })
  baseCurrency: string;

  @ApiProperty({
    description: 'Requested currency for conversion',
    example: 'BRL',
  })
  quoteCurrency: string;

  @ApiProperty({
    description: 'Exchange rate used for conversion',
    example: '5.2500000000',
  })
  rate: string;

  @ApiProperty({
    description: 'Timestamp when the rate was valid',
    example: '2026-01-19T14:00:00.000Z',
  })
  asOf: Date;

  @ApiProperty({
    description: 'Original price in cents before conversion',
    example: 9900,
  })
  originalPriceCents: number;
}

export class PlanWithFxDto {
  @ApiProperty({
    description: 'Unique identifier for the plan',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'Name of the plan',
    example: 'Premium Plan',
  })
  name: string;

  @ApiProperty({
    description: 'Price in cents (possibly converted)',
    example: 51975,
  })
  priceCents: number;

  @ApiProperty({
    description: 'Currency code (original or converted)',
    example: 'BRL',
  })
  currency: string;

  @ApiProperty({
    description: 'Billing interval',
    example: 'MONTHLY',
  })
  interval: string;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2026-01-19T14:13:55.661Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2026-01-19T14:13:55.661Z',
  })
  updatedAt: Date;

  @ApiPropertyOptional({
    description:
      'FX conversion metadata (only present when conversion is applied)',
    type: FxMetadataDto,
  })
  fx?: FxMetadataDto;
}
