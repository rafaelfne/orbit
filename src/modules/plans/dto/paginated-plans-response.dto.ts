import { ApiProperty } from '@nestjs/swagger';
import { PlanWithFxDto } from './plan-with-fx.dto';

export class PaginatedPlansResponseDto {
  @ApiProperty({
    description: 'Array of plans',
    type: [PlanWithFxDto],
  })
  items: PlanWithFxDto[];

  @ApiProperty({
    description: 'Current page number',
    example: 1,
  })
  page: number;

  @ApiProperty({
    description: 'Number of items per page',
    example: 20,
  })
  pageSize: number;

  @ApiProperty({
    description: 'Total number of plans',
    example: 100,
  })
  total: number;
}
