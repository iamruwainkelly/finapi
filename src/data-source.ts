import { DataSource } from 'typeorm';

export const AppDataSource = new DataSource({
  type: 'better-sqlite3',
  database: './data.db',
  entities: [__dirname + '/**/*.entity{.ts,.js}'],
  synchronize: true,
});
