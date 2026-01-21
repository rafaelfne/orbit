import { Controller, Post, Body, Logger, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { BillingSimulationService } from './billing-simulation.service';
import { SimulateBillingRequestDto } from './dto/simulate-billing-request.dto';
import { SimulateBillingResponseDto } from './dto/simulate-billing-response.dto';

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  private readonly logger = new Logger(BillingController.name);

  constructor(
    private readonly billingSimulationService: BillingSimulationService,
  ) {}

  @Post('simulate')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Simulate monthly billing',
    description:
      'Creates billing records for elapsed subscription periods and advances subscription period windows. ' +
      'Supports both single subscription and batch processing. Idempotent - safe to rerun multiple times.',
  })
  @ApiResponse({
    status: 200,
    description: 'Billing simulation completed successfully',
    type: SimulateBillingResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Subscription not found (when subscriptionId is provided)',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request parameters',
  })
  async simulate(
    @Body() dto: SimulateBillingRequestDto,
  ): Promise<SimulateBillingResponseDto> {
    this.logger.log(
      `POST /billing/simulate - subscriptionId=${dto.subscriptionId ?? 'ALL'}, dryRun=${dto.dryRun ?? false}`,
    );

    return await this.billingSimulationService.simulate(dto);
  }
}
