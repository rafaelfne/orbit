import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { SubscriptionResponseDto } from './dto/subscription-response.dto';
import { ListSubscriptionsQueryDto } from './dto/list-subscriptions-query.dto';
import { PaginatedSubscriptionsResponseDto } from './dto/paginated-subscriptions-response.dto';

@ApiTags('subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new subscription',
    description:
      'Creates a subscription for a customer to a plan. Enforces uniqueness: at most one ACTIVE subscription per customerId+planId.',
  })
  @ApiResponse({
    status: 201,
    description: 'Subscription created successfully',
    type: SubscriptionResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - validation error',
  })
  @ApiResponse({
    status: 404,
    description: 'Not found - plan does not exist',
  })
  @ApiResponse({
    status: 409,
    description:
      'Conflict - an active subscription for this customer and plan already exists',
  })
  async create(
    @Body() createSubscriptionDto: CreateSubscriptionDto,
  ): Promise<SubscriptionResponseDto> {
    return this.subscriptionsService.create(createSubscriptionDto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List all subscriptions with pagination',
    description:
      'Returns a paginated list of subscriptions. Each subscription includes a computed status (ACTIVE, OVERDUE, or CANCELED) derived at read-time.',
  })
  @ApiResponse({
    status: 200,
    description: 'Subscriptions retrieved successfully',
    type: PaginatedSubscriptionsResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - validation error',
  })
  async findAll(
    @Query() query: ListSubscriptionsQueryDto,
  ): Promise<PaginatedSubscriptionsResponseDto> {
    return this.subscriptionsService.findAll(
      query.page,
      query.pageSize,
      query.customerId,
    );
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get a subscription by ID',
    description:
      'Returns a subscription by ID. The response includes a computed status (ACTIVE, OVERDUE, or CANCELED) derived at read-time.',
  })
  @ApiResponse({
    status: 200,
    description: 'Subscription retrieved successfully',
    type: SubscriptionResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Subscription not found',
  })
  async findById(@Param('id') id: string): Promise<SubscriptionResponseDto> {
    return this.subscriptionsService.findById(id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel a subscription',
    description:
      'Cancels a subscription immediately. Sets status to CANCELED and records canceledAt timestamp. Returns 409 if subscription is already canceled.',
  })
  @ApiResponse({
    status: 200,
    description: 'Subscription canceled successfully',
    type: SubscriptionResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Subscription not found',
  })
  @ApiResponse({
    status: 409,
    description: 'Subscription is already canceled',
  })
  async cancel(@Param('id') id: string): Promise<SubscriptionResponseDto> {
    return this.subscriptionsService.cancel(id);
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reactivate a canceled subscription',
    description:
      'Reactivates a canceled subscription. Sets status to ACTIVE, records reactivatedAt timestamp, and starts a new billing period. Only CANCELED subscriptions can be reactivated.',
  })
  @ApiResponse({
    status: 200,
    description: 'Subscription reactivated successfully',
    type: SubscriptionResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Subscription not found',
  })
  @ApiResponse({
    status: 409,
    description: 'Conflict - subscription is already active',
  })
  async reactivate(@Param('id') id: string): Promise<SubscriptionResponseDto> {
    return this.subscriptionsService.reactivate(id);
  }
}
