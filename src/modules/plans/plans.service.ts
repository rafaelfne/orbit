import {
  Injectable,
  ConflictException,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plan } from './plan.entity';
import { CreatePlanDto } from './dto/create-plan.dto';

@Injectable()
export class PlansService {
  private readonly logger = new Logger(PlansService.name);

  constructor(
    @InjectRepository(Plan)
    private readonly planRepository: Repository<Plan>,
  ) {}

  async create(createPlanDto: CreatePlanDto): Promise<Plan> {
    const { name, priceCents, currency, interval = 'MONTHLY' } = createPlanDto;

    try {
      const plan = this.planRepository.create({
        name,
        priceCents,
        currency,
        interval,
      });

      const savedPlan = await this.planRepository.save(plan);

      this.logger.log(
        `Plan created: id=${savedPlan.id}, name=${savedPlan.name}, currency=${savedPlan.currency}`,
      );

      return savedPlan;
    } catch (error: unknown) {
      // Handle unique constraint violation (duplicate name)
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505'
      ) {
        this.logger.warn(
          `Duplicate plan name attempted: name=${name}, currency=${currency}`,
        );
        throw new ConflictException('A plan with this name already exists');
      }

      // Handle other database errors
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to create plan: ${errorMessage}`, errorStack);
      throw new InternalServerErrorException(
        'An error occurred while creating the plan',
      );
    }
  }
}
