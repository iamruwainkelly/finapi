import { DataSource } from 'typeorm';

export const AppDataSource = new DataSource({
  type: 'better-sqlite3',
  database: ':memory:', // Use in-memory database for testing
  // database: './data.db',
  entities: [__dirname + '/**/*.entity{.ts,.js}'],
  synchronize: true,
});
