import { Quote } from '../../entities/quote.entity';
import yahooFinance from 'yahoo-finance2';
import { AppDataSource } from '../../data-source';
import { YahooQuote } from 'src/typings/YahooQuote';

export class QuoteModule {
  constructor() {}
  async quote(symbol: string): Promise<YahooQuote> {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    // trim the symbol to ensure it is in uppercase
    symbol = symbol.trim().toUpperCase();

    console.log(`Fetching quote for ${symbol}...`);

    // get quote from the database, where updated field is not older than 1 minute
    const quote = await AppDataSource.getRepository(Quote)
      .createQueryBuilder('quote')
      .where('quote.symbol = :symbol', { symbol })
      .orderBy('quote.updated', 'DESC')
      .getOne();

    console.log(`Quote found in database: ${quote ? 'Yes' : 'No'}`);

    // if the record exists and is not older than 1 minute, return it
    if (quote && quote.updated) {
      // quote
      console.log(
        `Quote for ${quote.updated} found in database, checking if it's fresh...`,
      );

      const now = new Date();
      const lastUpdated = new Date(quote.updated);
      const diff = Math.abs(now.getTime() - lastUpdated.getTime());
      const diffMinutes = Math.ceil(diff / (1000 * 60));

      if (diffMinutes <= 1) {
        console.log(
          `Quote for ${symbol} is fresh (updated ${diffMinutes} minute(s) ago), returning cached data...`,
        );

        return quote;

        // return quote.json as YahooQuote;
      }
    } else {
      console.log(`Fetching quote for ${symbol} from Yahoo Finance...`);
      // const json = await yahooFinance.quote(symbol);

      console.log(
        `Quote for ${symbol} is older than 1 minute, fetching fresh data...`,
      );

      // if the record does not exist, retrieve it
      if (!quote) {
        console.log(
          `Quote for ${symbol} not found in database, fetching from Yahoo Finance...`,
        );

        // sleep for 2 seconds to avoid hitting the API too quickly
        // await new Promise((resolve) => setTimeout(resolve, 2000));

        console.log(`Fetching quote for ${symbol} from Yahoo Finance...`);
        const json = await yahooFinance.quote(symbol);

        const now = new Date();
        const newQuote = new Quote();
        newQuote.symbol = symbol;
        newQuote.json = json;
        newQuote.created = now.getTime();
        newQuote.createdString = now.toISOString();
        newQuote.updated = now.getTime();
        newQuote.updatedString = now.toISOString();
        await AppDataSource.getRepository(Quote).save(newQuote);
        return newQuote.json as YahooQuote;
      }

      console.log(
        `Quote for ${symbol} found in database, updating it with fresh data...`,
      );
      const json = await yahooFinance.quote(symbol);

      // if the record exists, update it
      const now = new Date();
      quote.json = json;
      quote.updated = now.getTime();
      quote.updatedString = now.toISOString();
      await AppDataSource.getRepository(Quote).save(quote);

      return quote.json as YahooQuote;
    }

    return quote.json as YahooQuote;
  }
}
