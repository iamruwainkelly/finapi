import { Controller, Get, Param } from '@nestjs/common';
import { AppService } from 'src/app.service';
import { IndexQuote } from 'src/typings/IndexQuote';
import { DataSource, Index } from 'typeorm';
import yahooFinance from 'yahoo-finance2';
import { Quote } from './entities/quote.entity';
import { History } from './entities/history.entity';
import { YahooHistoric } from './typings/YahooHistoric';

@Controller('api/')
export class AppController {
  constructor(
    private readonly appService: AppService,
    private dataSource: DataSource,
  ) {}
  @Get('getIndexQuotes')
  async getIndexQuotes(): Promise<IndexQuote[]> {
    // declare avar to check if we need to refetch quotes
    let refetch = false;

    // get all indexes from the database
    const indexes = await this.dataSource
      .getRepository(Index)
      .createQueryBuilder('index')
      .getMany();

    // get quoutes for these indexs from the db
    // if the quote already exists, skip it
    const existingQuotes = await this.dataSource
      .getRepository(Quote)
      .createQueryBuilder('quote')
      .where('quote.symbol IN (:...symbols)', {
        symbols: indexes.map((index) => index.symbol),
      })
      .getMany();

    // evaluate whether we need to refetch quotes
    if (existingQuotes.length < indexes.length) {
      // if the number of existing quotes is less than the number of indexes, we need to refetch quotes
      refetch = true;
    } else {
      // check if any of the existing quotes are older than 5 minutes
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
      for (const quote of existingQuotes) {
        const lastCreated = new Date(quote.created);
        if (lastCreated < fiveMinutesAgo) {
          refetch = true;
          break;
        }
      }
    }

    // if we need to refetch quotes, delete all quotes for these indexes
    if (refetch) {
      await this.dataSource
        .getRepository(Quote)
        .createQueryBuilder('quote')
        .delete()
        .where('quote.symbol IN (:...symbols)', {
          symbols: indexes.map((index) => index.symbol),
        })
        .execute();

      console.log(
        'Refetching quotes for indexes:',
        indexes.map((i) => i.symbol),
      );

      // perform a quoteCombine for each index
      await Promise.all(
        indexes.map(async (index) => {
          const result = await yahooFinance.quoteCombine(index.symbol, {
            fields: [
              'regularMarketPrice',
              'regularMarketChangePercent',
              'longName',
              'regularMarketPreviousClose',
              'quoteType',
              'averageDailyVolume10Day',
            ],
          });

          // save the result to the database
          const quote = new Quote();
          quote.symbol = index.symbol;
          quote.json = result;
          quote.created = new Date().getTime();
          await this.dataSource.getRepository(Quote).save(quote);
        }),
      );
    }

    //  get quotes for these indexes from the db
    const quotes = await this.dataSource
      .getRepository(Quote)
      .createQueryBuilder('quote')
      .where('quote.symbol IN (:...symbols)', {
        symbols: indexes.map((index) => index.symbol),
      })
      .getMany();

    // return only the json field of the quotes
    const returnObject = quotes.map((quote) => {
      return {
        symbol: quote.symbol,
        quote: quote.json,
      };
    });

    return returnObject;
  }
  @Get('history/:symbol')
  async history(@Param() params: any): Promise<History[]> {
    let refetchHistory = false;

    // get the history from the database, where symbol is the same as params.symbol
    // limit to the last 252 + 21 records
    const history = await this.dataSource
      .getRepository(History)
      .createQueryBuilder('history')
      .where('history.symbol = :symbol', { symbol: params.symbol })
      .orderBy('history.date', 'ASC')
      .getMany();

    // if there is history, get the created date of the last entry
    // if that data is not today, delete all history for that symbol
    if (history.length > 0) {
      // is this at least 252 + 21 records
      if (history.length < 252 + 21) {
        refetchHistory = true;
      } else {
        // get the last record in history
        const lastPriceEntry = history[history.length - 1];

        // check if the last entry 'created' is today or not
        const lastCreatedDate = new Date(lastPriceEntry.created);
        const today = new Date();

        // set the time of today to 00:00:00
        lastCreatedDate.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);

        // calculate the difference in days between the last entry date and today
        const diffTime = Math.abs(today.getTime() - lastCreatedDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        // if the last entry is older than 1 day, refetch history
        if (diffDays > 1) {
          refetchHistory = true;
        }
      }
    } else {
      // if there is no history, we need to refetch it
      refetchHistory = true;
    }

    // if we need to refetch history, delete all history for that symbol
    if (refetchHistory) {
      await this.dataSource
        .getRepository(History)
        .createQueryBuilder('history')
        .delete()
        .where('history.symbol = :symbol', { symbol: params.symbol })
        .execute();

      // fetch the history from Yahoo Finance
      const query = params.symbol;
      // set the start date to 2 year ago
      const startDate = new Date();
      startDate.setFullYear(startDate.getFullYear() - 2);
      const queryOptions = {
        period1: startDate,
      };
      const results: YahooHistoric[] = await yahooFinance.historical(
        query,
        queryOptions,
      );

      // loop through the results and save them to the database
      for (const r of results) {
        const history = new History();
        history.symbol = params.symbol;
        history.date = r.date.getTime();
        // store full datetime string
        history.dateString = r.date.toISOString();
        history.open = r.open;
        history.high = r.high;
        history.low = r.low;
        history.close = r.close;
        history.adjClose = r.adjClose;
        history.volume = r.volume;

        await this.dataSource.getRepository(History).save(history);
      }
    }

    return await this.dataSource
      .getRepository(History)
      .createQueryBuilder('history')
      .where('history.symbol = :symbol', { symbol: params.symbol })
      .orderBy('history.date', 'ASC')
      .getMany();
  }
}
