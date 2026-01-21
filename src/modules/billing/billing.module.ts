import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingEvent } from './billing-event.entity';
import { BillingService } from './billing.service';
import { BillingSimulationService } from './billing-simulation.service';
import { BillingController } from './billing.controller';
import { Subscription } from '../subscriptions/subscription.entity';
import { Plan } from '../plans/plan.entity';

@Module({
  imports: [TypeOrmModule.forFeature([BillingEvent, Subscription, Plan])],
  controllers: [BillingController],
  providers: [BillingService, BillingSimulationService],
  exports: [BillingService, BillingSimulationService],
})
export class BillingModule {}
