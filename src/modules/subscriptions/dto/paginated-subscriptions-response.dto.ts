import { ApiProperty } from '@nestjs/swagger';
import { SubscriptionResponseDto } from './subscription-response.dto';

export class PaginatedSubscriptionsResponseDto {
  @ApiProperty({
    description: 'Array of subscriptions',
    type: [SubscriptionResponseDto],
  })
  items: SubscriptionResponseDto[];

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
    description: 'Total number of subscriptions',
    example: 100,
  })
  total: number;
}
