import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CacheModule } from '@nestjs/cache-manager';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { HistoryModule } from './helpers/modules/history';
import { QuoteModule } from './helpers/modules/quote';

@Module({
  imports: [
    CacheModule.register({
      // milliseconds = seconds * 1000
      // 60 seconds = 1 minute
      // 5 minutes = 5 * 60 seconds = 5 * 1000 milliseconds
      ttl: 60 * 15 * 1000,
    }),
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',

      // im-memory
      //database: ":memory:",
      database: './data.db',
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      synchronize: true,
    }),
  ],
  controllers: [AppController],
  providers: [AppService, HistoryModule, QuoteModule],
})
export class AppModule {
  constructor(private dataSource: DataSource) {
    // Initialize the data source if not already initialized
    if (!this.dataSource.isInitialized) {
      this.dataSource
        .initialize()
        .then(() => {
          console.log('Data Source has been initialized!');
        })
        .catch((err) => {
          console.error('Error during Data Source initialization', err);
        });
    }
  }
}
