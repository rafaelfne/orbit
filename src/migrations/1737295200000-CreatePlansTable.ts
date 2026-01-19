import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreatePlansTable1737295200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable uuid extension if not already enabled
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');

    await queryRunner.createTable(
      new Table({
        name: 'plans',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'name',
            type: 'varchar',
            length: '80',
            isUnique: true,
            isNullable: false,
          },
          {
            name: 'price_cents',
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
            name: 'interval',
            type: 'varchar',
            length: '20',
            default: "'MONTHLY'",
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
            name: 'chk_price_cents_non_negative',
            expression: 'price_cents >= 0',
          },
          {
            name: 'chk_interval_monthly',
            expression: "interval = 'MONTHLY'",
          },
        ],
      }),
      true,
    );

    // Note: The unique index on name is already created via the isUnique: true
    // property in the column definition above
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('plans', true);
  }
}
