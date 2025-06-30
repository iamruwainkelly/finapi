import { Controller, Get, Param, Query, UseInterceptors } from '@nestjs/common';
import { AppService } from './app.service';
import yahooFinance from 'yahoo-finance2';

import { chromium } from 'patchright';

import * as fs from 'node:fs';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
// entities
import { Quote as QuoteEntity } from './entities/quote.entity';
// history
import { History } from './entities/history.entity';
// indexes
import { Index } from './entities/index.entity';
import { LogEntry } from './entities/logentry.entity';

import { DataSource } from 'typeorm';
import { PerformanceDays } from './typings/PerformanceDats';
import {
  ChangeAndChangePercent,
  SymbolPerformance,
} from './typings/IndexPerformance';
import { Quote } from './typings/Quote';

// prediction
import * as prediction from './helpers/modules/prediction.js';
import { MarketMover } from './entities/marketMover.entity';
import { News } from './entities/news.entity';
import { Stock } from './entities/stock.entity';

// import metrics.ts
import { getMetrics } from './helpers/modules/metrics';
import { Metrics } from './typings/Metrics';
import { QuoteSummaryResult } from 'yahoo-finance2/dist/esm/src/modules/quoteSummary-iface';
import { Etf } from './entities/etf.entity';
import { YahooQuote } from './typings/YahooQuote';

import { HistoryModule } from './helpers/modules/history';
import { QuoteModule } from './helpers/modules/quote';

interface PeerResult {
  symbol: string;
  price: number | undefined;
  performance: SymbolPerformance;
  history: History[];
}

// create a function to calculate the change in price between two dates
// and return the change in price and the change in percent
const calculateChange = (currentPrice: number, previousPrice: number) => {
  const change = currentPrice - previousPrice;
  const changePercent = (change / previousPrice) * 100;

  return { change, changePercent };
};

const indexes = [
  {
    yahooFinanceSymbol: '^GSPC',
    investingSymbol: 'SPX',
    investingUrlName: 'us-spx-500',
  },
  {
    yahooFinanceSymbol: '^IXIC',
    investingSymbol: 'IXIC',
    investingUrlName: 'nasdaq-composite',
  },
  {
    yahooFinanceSymbol: '^STOXX50E',
    investingSymbol: 'STOXX50E',
    investingUrlName: 'eu-stoxx50',
  },
  {
    yahooFinanceSymbol: '^SSMI',
    investingSymbol: 'SMI',
    investingUrlName: 'switzerland-20',
  },
];

// create an array of user agents
const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
  'Mozilla/5.0 (Windows NT 10.0; WOW64; rv:55.0) Gecko/20100101 Firefox/55.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
];

const contextOptions = {
  viewport: { width: 1280, height: 800 },
  userAgent: userAgents[Math.floor(Math.random() * userAgents.length)],
  deviceScaleFactor: 1,
};

@Controller('api/')
export class AppController {
  constructor(
    private readonly appService: AppService,
    private dataSource: DataSource,
    private historyModule: HistoryModule,
    private quoteModule: QuoteModule,
  ) {}

  // **********************************
  // Functions
  // **********************************
  calculateRSI = (priceHistory: History[], period = 14) => {
    // get the last 60 days - // Get enough data for smoothing
    priceHistory = priceHistory.slice(-60);

    const closes = priceHistory.map((d) => d.close);
    if (closes.length < period) {
      console.log(`Not enough data to calculate RSI(${period})`);
      return null;
    }

    // handle closes with null or undefined values
    const validCloses = closes.filter((c) => c != null);

    let gains = 0,
      losses = 0;
    for (let i = 1; i <= period; i++) {
      const diff = validCloses[i] - validCloses[i - 1];
      if (diff >= 0) gains += diff;
      else losses -= diff;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    for (let i = period + 1; i < validCloses.length; i++) {
      const diff = validCloses[i] - validCloses[i - 1];
      avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
    }

    const rs = avgGain / avgLoss;
    const rsi = 100 - 100 / (1 + rs);

    return rsi;
  };

  // create a function that take in a interger that is used to take the last n records from the history
  // and return the priceChange and percentageChange of the stock for the last n record
  async performanceDays(
    symbol: string,
    days: number,
  ): Promise<ChangeAndChangePercent> {
    // get history from the database, where symbol is the same as params.symbol
    const history = await this.history(symbol);

    // Sort history by date in ascending order
    history.sort((a, b) => a.date - b.date);

    // use the last n records
    const lastNEntries = history.slice(-days);

    const first = lastNEntries[0].close;
    const last = lastNEntries[lastNEntries.length - 1]?.close;

    if (first == null || last == null) {
      return {
        change: 0,
        changePercent: 0,
      };
    }

    const priceChange = (last ?? 0) - first;
    const priceChangePercentage = first !== 0 ? (priceChange / first) * 100 : 0;

    return {
      change: priceChange,
      changePercent: priceChangePercentage,
    };
  }

  // create a performance function that takes in History array and a start date where to start calculating from
  async calculatePerformance(
    history: History[],
    startDate: Date,
  ): Promise<ChangeAndChangePercent> {
    const filtered = history.filter(
      (h) => new Date(h.date).getTime() >= startDate.getTime(),
    );

    if (!filtered.length) {
      console.log(`No historical data found for the given date`);
      return {
        change: 0,
        changePercent: 0,
      };
    }

    const first = filtered[0].close;
    const last = filtered[filtered.length - 1]?.close;

    if (first == null || last == null) {
      return {
        change: 0,
        changePercent: 0,
      };
    }

    const priceChange = (last ?? 0) - first;
    const priceChangePercentage = first !== 0 ? (priceChange / first) * 100 : 0;

    return {
      change: priceChange,
      changePercent: priceChangePercentage,
    };
  }

  async calculateYTD(ticker: string) {
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);

    try {
      const history = await this.history(ticker);

      // find the first record in history where the date is greater than or equal to yearStart
      const historical = history.filter(
        (h) => new Date(h.date).getTime() >= yearStart.getTime(),
      );

      if (!historical.length) {
        console.log(`No historical data found for ${ticker}`);
        return null;
      }

      // print the first and last entry in the historical data
      const firstEntry = historical[0];
      const firstDate = new Date(firstEntry.date);
      const firstDateString = firstDate.toISOString().split('T')[0];

      const lastEntry = historical[historical.length - 1];
      const lastDate = new Date(lastEntry.date);
      const lastDateString = lastDate.toISOString().split('T')[0];

      const startPrice = firstEntry.close;
      const latestPrice = lastEntry.close;

      if (startPrice == null || latestPrice == null) {
        console.log(`No valid prices found for ${ticker}`);
        return null;
      }

      const ytdChange = latestPrice - startPrice;
      const ytdChangePercent =
        startPrice !== 0 ? (ytdChange / startPrice) * 100 : 0;

      return {
        ticker,
        startPrice,
        latestPrice,
        ytdChange: +ytdChange.toFixed(4),
        ytdChangePercent: +ytdChangePercent.toFixed(2),
      };
    } catch (error) {
      console.error(`Error fetching YTD data for ${ticker}:`, error);
      return null;
    }
  }

  async performanceDate(symbol: string, date: Date): Promise<PerformanceDays> {
    // get history from the database, where symbol is the same as params.symbol
    const history = await this.dataSource
      .getRepository(History)
      .createQueryBuilder('history')
      .where('history.symbol = :symbol', { symbol: symbol })
      .orderBy('history.date', 'ASC')
      .getMany();

    // Sort history by date in ascending order
    history.sort((a, b) => a.date - b.date);

    // find the first entry in history where the date is greater than or equal to the date parameter
    const firstEntry = history.find(
      (entry) => new Date(entry.date).getTime() >= date.getTime(),
    );

    const first = firstEntry?.close || 0;
    const last = history[history.length - 1].close;

    const priceChange = (last ?? 0) - first;
    const priceChangePercentage = (priceChange / first) * 100;

    return {
      priceChange: priceChange,
      priceChangePercentage: priceChangePercentage,
    };
  }

  // **********************************
  // Endpoints
  // **********************************

  @UseInterceptors(CacheInterceptor)
  @CacheTTL(60 * 60 * 24)
  @Get('getPrediction/:symbol')
  async getPrediction(@Param() params: any): Promise<object> {
    const p = await prediction.predict(params.symbol);
    return {
      symbol: params.symbol,
      prediction: p,
    };
  }

  @Get('forecast/:symbol')
  async forecast(@Param('symbol') symbol: string): Promise<object> {
    // get quote for the stock
    const quote = await this.quote(symbol);
    const quoteSummary = await this.quoteSummary(symbol);

    // get metrics for the stock
    const metrics: Metrics = await getMetrics(symbol);
    // get historic data for the stock
    const history = await this.history(symbol);

    const peRatio = quoteSummary.summaryDetail?.trailingPE;
    const pbRatio = quoteSummary.defaultKeyStatistics?.priceToBook;

    let evToEbitda;
    const ev = quoteSummary?.defaultKeyStatistics?.enterpriseValue;
    const ebitda = quoteSummary.financialData?.ebitda;
    if (!ev || !ebitda) {
      evToEbitda = null;
    } else {
      evToEbitda = ev / ebitda;
    }

    let ytdReturn = await this.calculateYTD(symbol);

    const beta = quoteSummary.defaultKeyStatistics?.beta;

    // calculate 30d volatility

    // first use the last 45 days of history
    // 45 to account for non-trading days
    const last45Days = history.slice(-45);
    const closes = last45Days.map((d) => d.close).filter(Boolean);
    //
    const returns = closes
      .slice(1)
      .map((price, i) => Math.log((price ?? 1) / (closes[i] ?? 1)));
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const squaredDiffs = returns.map((r) => Math.pow(r - mean, 2));
    const variance =
      squaredDiffs.reduce((a, b) => a + b, 0) / squaredDiffs.length;
    const stdDev = Math.sqrt(variance);
    const volatility30d = stdDev * Math.sqrt(252) * 100;

    const currentVolume = quoteSummary.price?.regularMarketVolume;
    const averageVolume =
      quoteSummary.summaryDetail?.averageVolume ||
      quoteSummary.summaryDetail?.averageDailyVolume10Day;

    const rsi14 = this.calculateRSI(history, 14);

    // calc Vol/Avg Ratio
    const volumeAverageRatio = (currentVolume ?? 0) / (averageVolume ?? 1);

    const results = {
      // confidence: randomInt(10, 69), // get for quote
      // confidenceLevelText: 'High Confidence',
      // sentiment: 'Strong Buy',
      recentPerformance: 3.42, // get for quote
      recentPerformanceDirection: 'Up', // get for quote
      current: 181.54,
      // target: 191.07,
      // potential: 5.25,
      quote: quote,
      quoteSummary: quoteSummary,
      forecastPeriods: metrics,
      valuation: {
        peRatio: peRatio,
        pbRatio: pbRatio,
        evToEbitda: evToEbitda,
        marketCap: quote.marketCap,
      },
      performance: {
        ytdReturn: ytdReturn,
        beta: beta,
        fiftyTwoWeekRangeLow:
          quoteSummary.summaryDetail?.fiftyTwoWeekLow ?? null,
        fiftyTwoWeekRangeHigh:
          quoteSummary.summaryDetail?.fiftyTwoWeekHigh ?? null,
        volatility30d: volatility30d,
      },
      currentVolume: currentVolume,
      averageVolume: averageVolume,
      volumeAverageRatio: volumeAverageRatio,
      rsi14: rsi14,
      riskFactorExposures: [
        {
          name: 'Market',
          value: 65,
        },
        {
          name: 'Size',
          value: 12,
        },
        {
          name: 'Value',
          value: 8,
        },
        {
          name: 'Momentum',
          value: 25,
        },
        {
          name: 'Quality',
          value: 5,
        },
        {
          name: 'Volatility',
          value: 18,
        },
      ],
      riskFactorContribution: [
        {
          name: 'Market',
          value: 65,
        },
        {
          name: 'Size',
          value: 12,
        },
        {
          name: 'Value',
          value: 8,
        },
        {
          name: 'Momentum',
          value: 25,
        },
        {
          name: 'Quality',
          value: 5,
        },
        {
          name: 'Volatility',
          value: 18,
        },
      ],
      riskMetrics: {
        correlation: 0.78,
        valueAtRisk: -4.32,
        expectedShortFall: -7.85,
        maxDrawDown: -18.4,
      },
      priceHistory: history,
    };

    return results;
  }

  @Get('quote/:symbol')
  async quote(@Param('symbol') symbol: string): Promise<YahooQuote> {
    console.log(`Fetching .quote for ${symbol}...`);
    return this.quoteModule.quote(symbol);
  }

  // create non-endpoint function that return the day for various typed timeframes
  // 1d, 5d, 1mo, 3mo, 6mo, 1y, 3yr, 5yr
  // use setX methods to set the hours, minutes, seconds and milliseconds to 0
  private getPastDate(
    timeframe: '1d' | '5d' | '1mo' | '3mo' | '6mo' | '1y' | '3yr' | '5yr',
  ): Date {
    let date = new Date();
    date.setHours(0, 0, 0, 0);

    switch (timeframe) {
      case '1d':
        date.setDate(date.getDate() - 1);
        break;
      case '5d':
        date.setDate(date.getDate() - 5);
        break;
      case '1mo':
        date.setMonth(date.getMonth() - 1);
        break;
      case '3mo':
        date.setMonth(date.getMonth() - 3);
        break;
      case '6mo':
        date.setMonth(date.getMonth() - 6);
        break;
      case '1y':
        date.setFullYear(date.getFullYear() - 1);
        break;
      case '3yr':
        date.setFullYear(date.getFullYear() - 3);
        break;
      case '5yr':
        date.setFullYear(date.getFullYear() - 5);
        break;
      default:
        throw new Error('Invalid timeframe');
    }

    return date;
  }

  @Get('performance/:symbol')
  async performance(
    @Param('symbol') symbol: string,
  ): Promise<SymbolPerformance> {
    // get history from the database, where symbol is the same as symbol param
    const history = await this.history(symbol);

    // create object array for different time periods
    const timeframes = [
      {
        name: '5d',
        jsonName: 'fiveDays',
        startDay: new Date(history[history.length - 5]?.date ?? Date.now()),
      },
      {
        name: '1mo',
        jsonName: 'oneMonth',
        startDay: this.getPastDate('1mo'),
      },
      {
        name: '3mo',
        jsonName: 'threeMonths',
        startDay: this.getPastDate('3mo'),
      },
      {
        name: '6mo',
        jsonName: 'sixMonths',
        startDay: this.getPastDate('6mo'),
      },
      {
        name: '1y',
        jsonName: 'oneYear',
        startDay: this.getPastDate('1y'),
      },
      {
        name: '3yr',
        jsonName: 'threeYears',
        startDay: this.getPastDate('3yr'),
      },
      {
        name: '5yr',
        jsonName: 'fiveYears',
        startDay: this.getPastDate('5yr'),
      },
    ];

    const performanceData = await Promise.all(
      timeframes.map(async (frame) => {
        const data = await this.calculatePerformance(history, frame.startDay);
        return {
          period: frame.name,
          data,
        };
      }),
    );

    // obtain current price
    const currentQuote = await this.quote(symbol);
    const oneDay: ChangeAndChangePercent = {
      change: currentQuote.regularMarketChange,
      changePercent: currentQuote.regularMarketChangePercent,
    };

    // calculate year to date performance
    const ytdData = await this.calculateYTD(symbol);

    // return instance of IndexPerformance
    return {
      symbol: symbol.toUpperCase(),
      performance: {
        oneDay: oneDay,
        fiveDays: performanceData.find((d) => d.period === '5d')?.data,
        oneMonth: performanceData.find((d) => d.period === '1mo')?.data,
        threeMonths: performanceData.find((d) => d.period === '3mo')?.data,
        sixMonths: performanceData.find((d) => d.period === '6mo')?.data,
        oneYear: performanceData.find((d) => d.period === '1y')?.data,
        threeYears: performanceData.find((d) => d.period === '3yr')?.data,
        fiveYears: performanceData.find((d) => d.period === '5yr')?.data,
        yearToDate: {
          change: ytdData ? ytdData.ytdChange : undefined,
          changePercent: ytdData ? ytdData.ytdChangePercent : undefined,
        },
      },
    };
  }

  // quoteSummary
  @Get('quote-summary/:symbol')
  async quoteSummary(@Param() symbol: string): Promise<QuoteSummaryResult> {
    const results = await yahooFinance.quoteSummary(symbol, {
      modules: [
        'defaultKeyStatistics',
        'financialData',
        'summaryDetail',
        'price',
      ],
    });

    return results;
  }

  @UseInterceptors(CacheInterceptor)
  @Get('news/:symbol')
  async news(@Param('symbol') symbol: string): Promise<object> {
    // get news from the database, where symbol is the same as params.symbol
    // get one record from the database, where symbol is the same as params.symbol
    const news = await this.dataSource
      .getRepository(News)
      .createQueryBuilder('news')
      .where('news.symbol = :symbol', { symbol: symbol })
      .getOne();

    // if the news exists, return it
    if (news) {
      return {
        news: JSON.parse(news.json),
      };
    }

    // if the news does not exist, return empty news object
    return {
      news: {},
    };
  }

  @UseInterceptors(CacheInterceptor)
  @ApiExcludeEndpoint()
  @Get('market-movers/:symbol')
  // @Param('symbol') symbol: string,
  async marketMovers(@Param('symbol') symbol: string): Promise<object> {
    // get the index from the indexes array
    const indexEntry = indexes.find(
      (index) => index.yahooFinanceSymbol === symbol.toUpperCase(),
    );

    // if the index is not found, return an error
    if (!indexEntry) {
      return {
        error:
          'Index not found. Index should be one of the following: ^GSPC, ^IXIC, ^STOXX50E, ^SSMI',
      };
    }

    // get the index from the database
    // return the json from the database if it exists
    const marketMovers = await this.dataSource
      .getRepository(MarketMover)
      .createQueryBuilder('marketMover')
      .where('marketMover.symbol = :symbol', {
        symbol: indexEntry.yahooFinanceSymbol,
      })
      .getOne();

    // return the json from the database
    // if the marketMovers is not found, return empty 'GainersAndLosers' object
    if (!marketMovers) {
      return {
        gainers: [],
        losers: [],
      };
    }

    // if the marketMovers is found, return the json
    const marketMoversJson = JSON.parse(marketMovers.json);

    // return the json as GainersAndLosers object
    return {
      gainers: marketMoversJson.gainers,
      losers: marketMoversJson.losers,
    };
  }

  // route for scraping a url
  @ApiExcludeEndpoint()
  @Get('scrape')
  async scrape(): Promise<object> {
    const browser = await chromium.launchPersistentContext('./browser', {
      channel: 'chrome',
      headless: true,
      viewport: null,
    });
    // const context = await browser.newContext(contextOptions);
    const page = await browser.newPage();

    // intialize the page and store any cookies for the next request
    await page.goto('https://etfdb.com', {
      waitUntil: 'domcontentloaded',
    });

    // sleep logic for  3 seconds
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const BASE_URL =
      'https://etfdb.com/data_set/?tm=92882&no_null_sort=true&count_by_id=&sort=symbol&order=asc&offset=';

    const allRows = [];
    let offset = 0;
    let total = null;

    while (true) {
      const url = `${BASE_URL}${offset}`;
      console.log(`Fetching: ${url}`);

      // wait 5 seconds before each request
      await new Promise((resolve) => setTimeout(resolve, 5000));

      try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        const content = await page.content();

        // write the content to a file for debugging
        fs.writeFileSync(`etfdb_page_${offset}.html`, content);

        const data = JSON.parse(content);

        // const data = response.data;

        console.log(`✅ Downloaded ${allRows.length} ETF records.`);

        if (!total) {
          total = data.total;
          console.log(`Total records to fetch: ${total}`);
        }

        const rows = data.rows;
        if (!rows.length) break;

        allRows.push(...rows);
        offset += 25;

        if (allRows.length >= total) break;
      } catch (err) {
        console.error('Failed to fetch data:', err.message);
        break;
      }
    }

    await browser.close();

    // Optional: Save to JSON file
    fs.writeFileSync('etfs.json', JSON.stringify(allRows, null, 2));
    console.log(`📁 Saved to etfs.json`);

    // Return the scraped data
    return {
      message: `Scraped ${allRows.length} ETF records.`,
      data: allRows,
    };
  }

  // **************************************************************
  // Index related endpoints
  // **************************************************************

  @Get('getIndexQuote/:symbol')
  async getIndexQuote(
    @Param('symbol') symbol: string,
  ): Promise<Quote | { error: string }> {
    // get the quote for the symbol from the database
    const quote = await this.dataSource
      .getRepository(QuoteEntity)
      .createQueryBuilder('quote')
      .where('quote.symbol = :symbol', { symbol: symbol })
      .getOne();

    // if the quote does not exist, return an error
    if (!quote) {
      return {
        error: `Quote for symbol ${symbol} not found.`,
      };
    }

    // return the quote if it exists
    return {
      symbol: quote.symbol,
      quote: quote.json,
    };
  }

  // getIndexHistorical
  @Get('getIndexPerformances')
  async getIndexPerformances(): Promise<SymbolPerformance[]> {
    // get all indexes from the database
    const indexes = await this.dataSource
      .getRepository(Index)
      .createQueryBuilder('index')
      .getMany();

    // for each index, get the history from this.performance
    const performancePromises = indexes.map(async (index) => {
      // get the performance for the index
      const performance = await this.performance(index.symbol);

      // return the performance object
      return performance;
    });

    // wait for all promises to resolve
    const performanceResults = await Promise.all(performancePromises);

    // return the performance results
    return performanceResults;
  }

  // getIndexPerformance
  @Get('getIndexPerformance/:symbol')
  async getIndexPerformance(
    @Param() symbol: string,
  ): Promise<SymbolPerformance | { error: string }> {
    const performances = await this.getIndexPerformances();

    // find the performance for the symbol
    const performance = performances.find(
      (p) => p.symbol === symbol.toUpperCase(),
    );

    // if the performance does not exist, return an error
    if (!performance) {
      return {
        error: `Performance for symbol ${symbol} not found.`,
      };
    }

    // return the performance if it exists
    return performance;
  }

  @Get('dashboard')
  async dashboard(): Promise<object> {
    // get indexes from the database
    const indexes = await this.dataSource
      .getRepository(Index)
      .createQueryBuilder('index')
      .getMany();

    // for each index, get the quote, history, search and market movers
    const dashboardPromises = indexes.map(async (index) => {
      // get the quote for the index
      const quote = await this.getIndexQuote(index.symbol);

      // get the history for the index
      const performance = await this.getIndexPerformance(index.symbol);

      //get the news results for the index
      const news = await this.news(index.symbol);

      // get the market movers for the index
      const marketMovers = await this.marketMovers(index.symbol);

      // forecast the index
      const forecast = await this.forecast(index.symbol);

      // return the dashboard object for the index
      return {
        symbol: index.symbol,
        quote: quote,
        performance: performance,
        news: news,
        marketMovers: marketMovers,
        forecast: forecast,
      };
    });

    // wait for all promises to resolve
    const dashboardResults = await Promise.all(dashboardPromises);

    // return the dashboard results
    return dashboardResults;
  }

  @Get('dashboard2')
  async dashboard2(): Promise<object> {
    // get indexes from the database
    const indexes = await this.dataSource
      .getRepository(Index)
      .createQueryBuilder('index')
      .getMany();

    // for each index, get the quote, history, search and market movers
    const dashboardPromises = [];
    for (const index of indexes) {
      dashboardPromises.push(
        (async () => {
          // get the quote for the index
          //const quote = await this.getIndexQuote(index.symbol);
          const quote = await this.quoteModule.quote(index.symbol);

          // get the history for the index
          const performance = await this.getIndexPerformance(index.symbol);

          //get the news results for the index
          const news = await this.news(index.symbol);

          // get the market movers for the index
          const marketMovers = await this.marketMovers(index.symbol);

          // forecast the index
          const forecast = await this.forecast(index.symbol);

          // return the dashboard object for the index
          return {
            symbol: index.symbol,
            quote: quote,
            performance: performance,
            news: news,
            marketMovers: marketMovers,
            forecast: forecast,
          };
        })(),
      );
    }

    // wait for all promises to resolve
    const dashboardResults = await Promise.all(dashboardPromises);

    // return the dashboard results
    return dashboardResults;
  }

  @Get('logs')
  async getLogs(): Promise<object[]> {
    const logs = await this.dataSource
      .getRepository(LogEntry)
      .createQueryBuilder('log')
      .orderBy('log.id', 'DESC')
      .getMany();
    return logs.map((log) => {
      let createdISO: string = '';
      // convert getTime() to ISO string
      if (log.created) {
        createdISO = new Date(log.created).toISOString();
      }
      return {
        id: log.id,
        level: log.level,
        message: log.message,
        context: log.context,
        created: createdISO,
      };
    });
  }

  @Get('stocks/:indexSymbol')
  async getStocksByIndex(
    @Param('indexSymbol') indexSymbol: string,
  ): Promise<object[]> {
    const stocks = await this.dataSource
      .getRepository(Stock)
      .createQueryBuilder('stock')
      .where('stock.indexSymbol = :indexSymbol', { indexSymbol })
      .getMany();
    return stocks;
  }

  @Get('stocks')
  async getStocks(): Promise<object[]> {
    const stocks = await this.dataSource
      .getRepository(Stock)
      .createQueryBuilder('stock')
      .getMany();
    return stocks;
  }

  // add route to get etf
  // only get id, symbol, name
  // allow search by symbol and name
  @Get('etfs')
  async getEtfs(@Query('search') search?: string): Promise<Etf[]> {
    const query = this.dataSource
      .getRepository(Etf)
      .createQueryBuilder('etf')
      .select(['etf.id', 'etf.symbol', 'etf.name']);

    if (search) {
      query.where('etf.symbol LIKE :search OR etf.name LIKE :search', {
        search: `%${search}%`,
      });
    }

    return await query.getMany();
  }

  @Get('etf/:id')
  async getEtfById(@Param('id') id: number): Promise<Etf | null> {
    const etf = await this.dataSource
      .getRepository(Etf)
      .createQueryBuilder('etf')
      .where('etf.id = :id', { id })
      .select(['etf.id', 'etf.symbol', 'etf.name'])
      .getOne();
    return etf || null;
  }

  @Get('price-change/:symbol')
  async getPriceChange(@Param('symbol') symbol: string): Promise<PeerResult> {
    // get current price from the quote
    const quote = await yahooFinance.quote(symbol);

    // Fetch history from DB, sorted ascending
    const history = await this.history(symbol);

    // get performance()
    const performance = await this.performance(symbol);

    return {
      symbol,
      price: quote.regularMarketPrice,
      performance,
      history,
    };
  }

  @Get('history/:symbol')
  async history(@Param('symbol') symbol: string): Promise<History[]> {
    return this.historyModule.history(symbol);
  }

  @Get('peer/:symbol')
  async peer(@Param('symbol') symbol: string): Promise<any> {
    // trim the symbol to ensure it is in uppercase
    symbol = symbol.trim().toUpperCase();

    // get the quote for the symbol
    const quote = await this.quote(symbol);
    if (!quote) {
      throw new Error(`Quote for symbol ${symbol} not found.`);
    }

    // get the history for the symbol
    const history = await this.history(symbol);

    if (!history || history.length === 0) {
      throw new Error(`History for symbol ${symbol} not found.`);
    }

    // get only the last year of history
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const lastYearHistory = history.filter(
      (entry) => entry.date > oneYearAgo.getTime(),
    );
    if (lastYearHistory.length === 0) {
      throw new Error(
        `No history found for symbol ${symbol} in the last year.`,
      );
    }

    // get the performance for the symbol
    const performance = await this.performance(symbol);

    if (!performance) {
      throw new Error(`Performance for symbol ${symbol} not found.`);
    }

    // return the peer result
    return {
      symbol: symbol.toUpperCase(),
      exchange: quote.exchange,
      market: quote.market,
      shortName: quote.shortName ?? quote.longName ?? symbol.toUpperCase(),
      longName: quote.longName ?? quote.shortName ?? symbol.toUpperCase(),
      currency: quote.currency ?? 'USD',
      price: quote.regularMarketPrice,
      history: lastYearHistory,
      performance: performance.performance,
    };
  }
}

/*

- uses captcha:
https://www.marketwatch.com

# todo
 https://priceapi.moneycontrol.com/technicalCompanyData/usMarket/getTopLoser?index=SPX:IND&view=web&section=overview&deviceType=W
https://priceapi.moneycontrol.com/technicalCompanyData/usMarket/getTopGainer?index=SPX:IND&view=web&section=overview&deviceType=W

 https://priceapi.moneycontrol.com/technicalCompanyData/usMarket/getTopLoser?index=NDX:IND&view=web&section=overview&deviceType=W
https://priceapi.moneycontrol.com/technicalCompanyData/usMarket/getTopGainer?index=NDX:IND&view=web&section=overview&deviceType=W


- market movers
  - https://markets.businessinsider.com/index/market-movers/s&p_500
  - https://markets.businessinsider.com/index/market-movers/smi
  - https://markets.businessinsider.com/index/market-movers/euro_stoxx_50
  - https://markets.businessinsider.com/index/market-movers/nasdaq_composite (not working)
    - gets lots of symbols 10+, also shows 3m 6m and 1y performance
    - html scraping
  - https://gdsapi.cnbc.com/market-mover/groupMover/SP500/CHANGE_PCT/BOTH/12.json?source=SAVED&delayed=false&partnerId=2
    - has more than 5 symbols for top gainers and losers
    - json api


# captcha
https://www.wsj.com/market-data/quotes/index/XX/SX5P
https://www.wsj.com/market-data/quotes/index/US/SPX
https://www.wsj.com/market-data/quotes/index/US/COMP
https://www.wsj.com/market-data/quotes/index/CH/XSWX/SMI

# html scraping
https://www.investing.com/indices/switzerland-20
https://www.investing.com/indices/us-spx-500
https://www.investing.com/indices/nasdaq-composite
https://www.investing.com/indices/eu-stoxx50

*/
