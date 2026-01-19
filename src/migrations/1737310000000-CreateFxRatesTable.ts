import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateFxRatesTable1737310000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'fx_rates',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'base_currency',
            type: 'varchar',
            length: '3',
            isNullable: false,
          },
          {
            name: 'quote_currency',
            type: 'varchar',
            length: '3',
            isNullable: false,
          },
          {
            name: 'rate',
            type: 'numeric',
            precision: 20,
            scale: 10,
            isNullable: false,
          },
          {
            name: 'as_of',
            type: 'timestamptz',
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    // Add index for efficient rate lookups
    await queryRunner.createIndex(
      'fx_rates',
      new TableIndex({
        name: 'idx_fx_rates_lookup',
        columnNames: ['base_currency', 'quote_currency', 'as_of'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('fx_rates', true);
  }
}
