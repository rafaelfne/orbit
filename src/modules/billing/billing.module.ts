import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingEvent } from './billing-event.entity';
import { BillingService } from './billing.service';

@Module({
  imports: [TypeOrmModule.forFeature([BillingEvent])],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
