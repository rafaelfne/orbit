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
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { PlansService } from './plans.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { PlanResponseDto } from './dto/plan-response.dto';
import { ListPlansQueryDto } from './dto/list-plans-query.dto';
import { GetPlanQueryDto } from './dto/get-plan-query.dto';
import { PaginatedPlansResponseDto } from './dto/paginated-plans-response.dto';
import { PlanWithFxDto } from './dto/plan-with-fx.dto';

@ApiTags('plans')
@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new plan' })
  @ApiResponse({
    status: 201,
    description: 'Plan created successfully',
    type: PlanResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - validation error',
  })
  @ApiResponse({
    status: 409,
    description: 'Conflict - plan name already exists',
  })
  async create(@Body() createPlanDto: CreatePlanDto): Promise<PlanResponseDto> {
    return this.plansService.create(createPlanDto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List all plans with pagination' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    type: Number,
    description: 'Items per page (default: 20, max: 100)',
  })
  @ApiQuery({
    name: 'currency',
    required: false,
    enum: ['BRL', 'USD'],
    description: 'Currency for price conversion',
  })
  @ApiResponse({
    status: 200,
    description: 'Plans retrieved successfully',
    type: PaginatedPlansResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - validation error',
  })
  @ApiResponse({
    status: 422,
    description: 'Unprocessable entity - missing exchange rate',
  })
  async findAll(
    @Query() query: ListPlansQueryDto,
  ): Promise<PaginatedPlansResponseDto> {
    return this.plansService.findAll(
      query.page,
      query.pageSize,
      query.currency,
    );
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a plan by ID' })
  @ApiQuery({
    name: 'currency',
    required: false,
    enum: ['BRL', 'USD'],
    description: 'Currency for price conversion',
  })
  @ApiResponse({
    status: 200,
    description: 'Plan retrieved successfully',
    type: PlanWithFxDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Plan not found',
  })
  @ApiResponse({
    status: 422,
    description: 'Unprocessable entity - missing exchange rate',
  })
  async findById(
    @Param('id') id: string,
    @Query() query: GetPlanQueryDto,
  ): Promise<PlanWithFxDto> {
    return this.plansService.findById(id, query.currency);
  }
}
