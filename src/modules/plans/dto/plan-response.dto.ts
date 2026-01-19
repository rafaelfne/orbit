import { ApiProperty } from '@nestjs/swagger';

export class PlanResponseDto {
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
    description: 'Price in cents',
    example: 9900,
  })
  priceCents: number;

  @ApiProperty({
    description: 'Currency code',
    example: 'USD',
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
}
