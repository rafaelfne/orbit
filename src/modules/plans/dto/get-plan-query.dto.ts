import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsIn } from 'class-validator';

export class GetPlanQueryDto {
  @ApiPropertyOptional({
    description: 'Currency code for price conversion',
    enum: ['BRL', 'USD'],
    example: 'USD',
  })
  @IsOptional()
  @IsString()
  @IsIn(['BRL', 'USD'])
  currency?: string;
}
