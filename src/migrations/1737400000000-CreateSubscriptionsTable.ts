import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateSubscriptionsTable1737400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'subscriptions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'plan_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'customer_id',
            type: 'varchar',
            length: '64',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '20',
            isNullable: false,
          },
          {
            name: 'start_date',
            type: 'timestamptz',
            isNullable: false,
          },
          {
            name: 'current_period_start',
            type: 'timestamptz',
            isNullable: false,
          },
          {
            name: 'current_period_end',
            type: 'timestamptz',
            isNullable: false,
          },
          {
            name: 'canceled_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'reactivated_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
        checks: [
          {
            name: 'chk_status_valid',
            expression: "status IN ('ACTIVE', 'CANCELED')",
          },
          {
            name: 'chk_period_end_after_start',
            expression: 'current_period_end > current_period_start',
          },
        ],
      }),
      true,
    );

    // Add foreign key to plans table
    await queryRunner.createForeignKey(
      'subscriptions',
      new TableForeignKey({
        columnNames: ['plan_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'plans',
        onDelete: 'RESTRICT',
        name: 'fk_subscriptions_plan_id',
      }),
    );

    // Add indexes for common queries
    await queryRunner.createIndex(
      'subscriptions',
      new TableIndex({
        name: 'idx_subscriptions_plan_id',
        columnNames: ['plan_id'],
      }),
    );

    await queryRunner.createIndex(
      'subscriptions',
      new TableIndex({
        name: 'idx_subscriptions_customer_id',
        columnNames: ['customer_id'],
      }),
    );

    await queryRunner.createIndex(
      'subscriptions',
      new TableIndex({
        name: 'idx_subscriptions_status',
        columnNames: ['status'],
      }),
    );

    // Add partial unique index for uniqueness rule: at most one ACTIVE subscription per (customer_id, plan_id)
    await queryRunner.query(
      `CREATE UNIQUE INDEX idx_subscriptions_unique_active ON subscriptions (customer_id, plan_id) WHERE status = 'ACTIVE'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('subscriptions', true);
  }
}
