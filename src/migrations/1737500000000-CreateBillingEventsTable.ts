import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateBillingEventsTable1737500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'billing_events',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'subscription_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'period_start',
            type: 'timestamptz',
            isNullable: false,
          },
          {
            name: 'period_end',
            type: 'timestamptz',
            isNullable: false,
          },
          {
            name: 'amount_cents',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'currency',
            type: 'varchar',
            length: '3',
            isNullable: false,
          },
          {
            name: 'payment_status',
            type: 'varchar',
            length: '20',
            isNullable: false,
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
            name: 'chk_period_end_after_start',
            expression: 'period_end > period_start',
          },
          {
            name: 'chk_amount_non_negative',
            expression: 'amount_cents >= 0',
          },
          {
            name: 'chk_payment_status_valid',
            expression: "payment_status IN ('PAID', 'UNPAID')",
          },
        ],
        uniques: [
          {
            name: 'uq_billing_events_subscription_period',
            columnNames: ['subscription_id', 'period_start', 'period_end'],
          },
        ],
      }),
      true,
    );

    // Add foreign key to subscriptions table
    await queryRunner.createForeignKey(
      'billing_events',
      new TableForeignKey({
        columnNames: ['subscription_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'subscriptions',
        onDelete: 'RESTRICT',
        name: 'fk_billing_events_subscription_id',
      }),
    );

    // Add index for overdue computation queries
    await queryRunner.createIndex(
      'billing_events',
      new TableIndex({
        name: 'idx_billing_events_subscription_period_end',
        columnNames: ['subscription_id', 'period_end'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('billing_events', true);
  }
}
