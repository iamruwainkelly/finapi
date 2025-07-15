import { DataSource } from 'typeorm';

export const AppDataSource = new DataSource({
  type: 'better-sqlite3',
  // im-memory
  database: ':memory:',
  // database: './data.db',
  entities: [__dirname + '/**/*.entity{.ts,.js}'],
  synchronize: true,
});
