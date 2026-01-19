import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('fx_rates')
export class FxRate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'base_currency', type: 'varchar', length: 3 })
  baseCurrency: string;

  @Column({ name: 'quote_currency', type: 'varchar', length: 3 })
  quoteCurrency: string;

  @Column({ type: 'numeric', precision: 20, scale: 10 })
  rate: string;

  @Column({ name: 'as_of', type: 'timestamptz' })
  asOf: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
