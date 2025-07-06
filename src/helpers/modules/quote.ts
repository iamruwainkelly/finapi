import { Quote } from '../../entities/quote.entity';
import yahooFinance from 'yahoo-finance2';
import { AppDataSource } from '../../data-source';
import { YahooQuote, YahooQuoteMinimal } from 'src/typings/YahooQuote';
import { differenceInMinutes } from 'date-fns';

export class QuoteModule {
  constructor() {}

  async getQuote(symbol: string): Promise<YahooQuoteMinimal> {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const quote = await AppDataSource.getRepository(Quote)
      .createQueryBuilder('quote')
      .where('quote.symbol = :symbol', { symbol })
      .orderBy('quote.updated', 'DESC')
      .select([
        'quote.symbol',
        'quote.regularMarketPrice',
        'quote.regularMarketChange',
        'quote.regularMarketChangePercent',
        'quote.regularMarketTime',
        'quote.currency',
        'quote.fiftyTwoWeekLow',
        'quote.fiftyTwoWeekHigh',
        'quote.exchange',
        'quote.market',
        'quote.shortName',
        'quote.longName',
        'quote.marketCap',
      ])
      .getOne();

    return quote as YahooQuoteMinimal;
  }

  async quote(symbol: string): Promise<YahooQuoteMinimal> {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    // trim the symbol to ensure it is in uppercase
    symbol = symbol.trim().toUpperCase();

    // get quote from the database, where updated field is not older than 1 minute
    const quote = await AppDataSource.getRepository(Quote)
      .createQueryBuilder('quote')
      .where('quote.symbol = :symbol', { symbol })
      .orderBy('quote.updated', 'DESC')
      .select([
        'quote.symbol',
        'quote.regularMarketPrice',
        'quote.regularMarketChange',
        'quote.regularMarketChangePercent',
        'quote.regularMarketTime',
        'quote.currency',
        'quote.fiftyTwoWeekLow',
        'quote.fiftyTwoWeekHigh',
        'quote.exchange',
        'quote.market',
        'quote.shortName',
        'quote.longName',
        'quote.marketCap',
        'quote.updated',
      ])
      .getOne();

    // get current date and time in getTime format
    const currentTime = new Date();

    // if there is a quote, check the last entry and see if that entry created date is older than one minute
    if (quote) {
      const lastUpdated = new Date(quote.updated);
      const diffMinutes = differenceInMinutes(currentTime, lastUpdated);

      if (diffMinutes < 5) {
        return quote as YahooQuoteMinimal;
      } else {
        // if the quote is stale, fetch new data
        // fetch new data from Yahoo Finance
        console.log(`[UPD] Fetching quote for ${symbol} from Yahoo Finance...`);
        const yahooQuote = await yahooFinance.quote(symbol);

        const now = new Date();

        // update the quote in the database
        await AppDataSource.getRepository(Quote).update(
          { symbol: symbol },
          {
            // json: yahooQuote,
            regularMarketPrice: yahooQuote.regularMarketPrice,
            regularMarketChange: yahooQuote.regularMarketChange,
            regularMarketChangePercent: yahooQuote.regularMarketChangePercent,
            regularMarketTime: yahooQuote.regularMarketTime?.getTime(),
            currency: yahooQuote.currency,
            fiftyTwoWeekLow: yahooQuote.fiftyTwoWeekLow,
            fiftyTwoWeekHigh: yahooQuote.fiftyTwoWeekHigh,
            exchange: yahooQuote.exchange,
            market: yahooQuote.market,
            shortName: yahooQuote.shortName,
            longName: yahooQuote.longName,
            updated: now.getTime(),
            updatedString: now.toISOString(),
          },
        );

        // return the updated quote
        return this.getQuote(symbol);
      }
    }

    console.log(`[INS] Fetching quote for ${symbol} from Yahoo Finance...`);
    const yahooQuote = await yahooFinance.quote(symbol);

    const now = new Date();
    const newQuote = new Quote();
    newQuote.symbol = symbol;
    newQuote.json = yahooQuote;

    newQuote.regularMarketPrice = yahooQuote.regularMarketPrice;
    newQuote.regularMarketChange = yahooQuote.regularMarketChange;
    newQuote.regularMarketChangePercent = yahooQuote.regularMarketChangePercent;
    newQuote.regularMarketTime = yahooQuote.regularMarketTime?.getTime();
    newQuote.currency = yahooQuote.currency;
    newQuote.fiftyTwoWeekLow = yahooQuote.fiftyTwoWeekLow;
    newQuote.fiftyTwoWeekHigh = yahooQuote.fiftyTwoWeekHigh;
    newQuote.exchange = yahooQuote.exchange;
    newQuote.market = yahooQuote.market;
    newQuote.shortName = yahooQuote.shortName;
    newQuote.longName = yahooQuote.longName;

    newQuote.created = now.getTime();
    newQuote.createdString = now.toISOString();
    newQuote.updated = now.getTime();
    newQuote.updatedString = now.toISOString();
    await AppDataSource.getRepository(Quote).save(newQuote);

    // return the updated quote
    return this.getQuote(symbol);
  }
}
