import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CacheModule } from '@nestjs/cache-manager';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { HistoryModule } from './helpers/modules/history';
import { QuoteModule } from './helpers/modules/quote';
import { NewsService } from './modules/news/news.service';

import { Index } from './entities/index.entity';
import { News } from './entities/news.entity';
import { ScrapeService } from './modules/scrape/scrape.service';
import { ConfigModule } from '@nestjs/config';
import { AppDataSource } from './data-source';
import { MarketMoverService } from './modules/market-mover/market-mover.service';
import { MarketMover } from './entities/marketMover.entity';
import { HelloController } from './modules/hello/hello.controller';

@Module({
  imports: [
    CacheModule.register({
      // milliseconds = seconds * 1000
      // 60 seconds = 1 minute
      // 5 minutes = 5 * 60 seconds = 5 * 1000 milliseconds
      ttl: 60 * 15 * 1000,
    }),
    TypeOrmModule.forRoot(AppDataSource.options),
    TypeOrmModule.forFeature([News, Index, MarketMover]),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [AppController, HelloController],
  providers: [
    // modules
    AppService,
    MarketMoverService,
    NewsService,
    ScrapeService,
    // services
    HistoryModule,
    QuoteModule,
  ],
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
