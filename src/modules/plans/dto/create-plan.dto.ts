import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsInt,
  IsIn,
  IsOptional,
  MinLength,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreatePlanDto {
  @ApiProperty({
    description: 'Name of the plan',
    minLength: 3,
    maxLength: 80,
    example: 'Premium Plan',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  name: string;

  @ApiProperty({
    description: 'Price in cents (integer)',
    minimum: 0,
    example: 9900,
  })
  @IsInt()
  @Min(0)
  priceCents: number;

  @ApiProperty({
    description: 'Currency code',
    enum: ['BRL', 'USD'],
    example: 'USD',
  })
  @IsString()
  @IsIn(['BRL', 'USD'])
  currency: string;

  @ApiProperty({
    description: 'Billing interval (only MONTHLY supported for MVP)',
    enum: ['MONTHLY'],
    example: 'MONTHLY',
    required: false,
    default: 'MONTHLY',
  })
  @IsOptional()
  @IsString()
  @IsIn(['MONTHLY'])
  interval?: string;
}
