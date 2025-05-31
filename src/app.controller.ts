import { Controller, Get, Param, UseInterceptors } from '@nestjs/common';
import { AppService } from './app.service';
import yahooFinance from 'yahoo-finance2';
import { chromium, LaunchOptions } from 'playwright';
import * as cheerio from 'cheerio';
import * as fs from 'node:fs';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import * as ss from 'simple-statistics';
import { mean, std } from 'mathjs';

// entities
import { Quote } from './entities/quote.entity';
// history
import { History } from './entities/history.entity';
// indexes
import { Index } from './entities/index.entity';
import { LogEntry } from './entities/logentry.entity';

import { DataSource } from 'typeorm';
import { PerformanceDays } from './typings/PerformanceDats';
import { IndexPerformance } from './typings/IndexPerformance';
import { IndexQuote } from './typings/IndexQuote';

// prediction
import * as prediction from './helpers/prediction.js';
import { YahooHistoric } from './typings/YahooHistoric';
import { MarketMover } from './entities/marketMover.entity';
import { News } from './entities/news.entity';
import { Stock } from './entities/stock.entity';

// prediction.predict = prediction.predict.bind(prediction);

interface Historic {
  adjClose?: number | undefined;
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  dateString?: string | undefined;
  dateTicks: number;
}

// create a function to calculate the change in price between two dates
// and return the change in price and the change in percent
const calculateChange = (currentPrice: number, previousPrice: number) => {
  const change = currentPrice - previousPrice;
  const changePercent = (change / previousPrice) * 100;

  return { change, changePercent };
};

// function to calculate the change given a Historic object array and a date string
const calculateHistoricChangeByDate = (
  yahooHistoric: YahooHistoric[],
  date: Date,
) => {
  // create new object array with same fields as results and add dateTicks and dateString properties
  const historic: Historic[] = yahooHistoric.map((result: YahooHistoric) => {
    return {
      adjClose: result.adjClose,
      date: result.date,
      open: result.open,
      high: result.high,
      low: result.low,
      close: result.close,
      volume: result.volume,
      dateTicks: new Date(result.date).getTime() / 1000,
      dateString: new Date(result.date).toISOString().split('T')[0],
    };
  });

  // console.log('date', date);

  // declare todays date
  const today = new Date();

  // find an entry in newResults, where the datestring is equal to dtString
  let lookupEntry = historic.find(
    (result) => result.dateString === date.toISOString().split('T')[0],
  );

  // console.log('date-lookup1.1', lookupEntry);

  // if the entry is not found, starting from the end of the array, find the first entry where the dateTicks is less than dt
  if (!lookupEntry) {
    for (let i = historic.length - 1; i >= 0; i--) {
      if (historic[i].dateTicks < date.getTime() / 1000) {
        lookupEntry = historic[i];
        break;
      }
    }
  }

  // console.log('date-lookup1.2', lookupEntry);

  // get the last entry in the array
  const lastEntry = historic[historic.length - 1];

  // find the change between the last entry in historic and the lookupEntry
  const change = calculateChange(lastEntry.close, lookupEntry?.close ?? 0);

  return {
    change: change.change,
    changePercent: change.changePercent,
  };
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

// launch options for Playwright
const options: LaunchOptions = {
  headless: true,
  slowMo: 100,
  // set some args to make playwright behave more like a real browser
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-web-security',
    '--disable-features=IsolateOrigins,site-per-process',
    '--allow-insecure-localhost',
  ],
  ignoreDefaultArgs: ['--enable-automation'],
};

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
  ) {}

  @UseInterceptors(CacheInterceptor)
  // cache for 1 day
  @CacheTTL(60 * 60 * 24)
  @Get('getPrediction/:symbol')
  async getPrediction(@Param() params: any): Promise<object> {
    const p = await prediction.predict(params.symbol);
    return {
      symbol: params.symbol,
      prediction: p,
    };
  }

  @UseInterceptors(CacheInterceptor)
  @Get('quote/:symbol')
  async quote(@Param() params: any): Promise<object> {
    // get single record from the database, where symbol is ^GSPC
    const quote = await this.dataSource
      .getRepository(Quote)
      .findOneBy({ symbol: params.symbol });

    // if the record does not exist, create it
    if (!quote) {
      const newQuote = new Quote();
      newQuote.symbol = params.symbol;
      newQuote.json = await yahooFinance.quote(params.symbol);
      await this.dataSource.getRepository(Quote).save(newQuote);
      return newQuote.json;
    }

    // if the record exists, check if it is older than 1 minute
    const now = new Date();
    const lastUpdated = new Date(quote.updated);
    const diff = Math.abs(now.getTime() - lastUpdated.getTime());
    const diffMinutes = Math.ceil(diff / (1000 * 60));

    // if the record is older than 1 minute, update it
    if (diffMinutes > 1) {
      quote.json = await yahooFinance.quote(params.symbol);
      quote.updated = new Date().getTime();
      await this.dataSource.getRepository(Quote).save(quote);
    }

    return quote.json;
  }

  @Get('gainers/:symbol')
  async gainers(@Param() params: any): Promise<object> {
    // console.log('symbol', params.symbol);

    const results = await yahooFinance.dailyGainers(params.symbol);

    //results[0].

    return results;
  }

  @Get('quotes-multi')
  async quotesMulti(): Promise<object> {
    const indexSymbols = indexes.map((index) => index.yahooFinanceSymbol);

    // run all 4 functions in parallel
    const promises = indexSymbols.map(async (symbol) => {
      const quote = await this.quote({ symbol });
    });

    // wait for all promises to resolve
    const results = await Promise.all(promises);

    return results;
  }

  // create a function that take in a interger that is used to take the last n records from the history
  // and return the priceChange and percentageChange of the stock for the last n record

  async performanceDays(
    symbol: string,
    days: number,
  ): Promise<PerformanceDays> {
    // get history from the database, where symbol is the same as params.symbol
    const history = await this.dataSource
      .getRepository(History)
      .createQueryBuilder('history')
      .where('history.symbol = :symbol', { symbol: symbol })
      .orderBy('history.date', 'ASC')
      .getMany();

    // Sort history by date in ascending order
    history.sort((a, b) => a.date - b.date);

    // use the last n records
    const lastNEntries = history.slice(-days);

    const first = lastNEntries[0].close;
    const last = lastNEntries[lastNEntries.length - 1].close;

    const priceChange = last - first;
    const priceChangePercentage = (priceChange / first) * 100;

    return {
      priceChange: priceChange,
      priceChangePercentage: priceChangePercentage,
    };
  }

  @Get('performance/:symbol')
  async performance(@Param() params: any): Promise<IndexPerformance> {
    // get the history from the database, where symbol is the same as params.symbol
    const history = await this.dataSource
      .getRepository(History)
      .createQueryBuilder('history')
      .where('history.symbol = :symbol', { symbol: params.symbol })
      .orderBy('history.date', 'ASC')
      .getMany();

    // Sort history by date in ascending order
    history.sort((a, b) => a.date - b.date);
    // 5 days
    const last5 = await this.performanceDays(params.symbol, 5);
    // 1 month
    const last21 = await this.performanceDays(params.symbol, 21);
    // 3 months
    // 63 days is approximately 3 months of trading days
    const last63 = await this.performanceDays(params.symbol, 63);
    // 6 months
    const last126 = await this.performanceDays(params.symbol, 126);
    // 1 year
    // 252 days is approximately 1 year of trading days
    const last255 = await this.performanceDays(params.symbol, 255);

    return {
      symbol: params.symbol,
      performance: {
        fiveDay: {
          change: last5.priceChange,
          changePercent: last5.priceChangePercentage,
        },
        oneMonth: {
          change: last21.priceChange,
          changePercent: last21.priceChangePercentage,
        },
        threeMonths: {
          change: last63.priceChange,
          changePercent: last63.priceChangePercentage,
        },
        sixMonths: {
          change: last126.priceChange,
          changePercent: last126.priceChangePercentage,
        },
        oneYear: {
          change: last255.priceChange,
          changePercent: last255.priceChangePercentage,
        },
      },
    };
  }

  // quoteSummary
  @Get('quote-summary/:symbol')
  async quoteSummary(@Param() params: any): Promise<object> {
    console.log('symbol', params.symbol);

    // const results = await yahooFinance.quoteSummary(params.symbol, {
    //   modules: ['financialData', 'summaryDetail'],
    // });
    const results = await yahooFinance.quoteSummary(params.symbol);

    // results.

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

  @Get('market-movers-1/:index')
  async marketwatch(@Param() params: any): Promise<object> {
    // throw an error if they did not prefix the index with ^
    if (!params.index.startsWith('^')) {
      return {
        error:
          'Index should be prefixed with ^. Index should be one of the following: ^GSPC, ^IXIC, ^STOXX50E, ^SSMI',
      };
    }

    //get the index from the indexes array
    const index = indexes.find(
      (index) => index.yahooFinanceSymbol === params.index.toUpperCase(),
    );

    if (!index) {
      return {
        error:
          'Index not found. Index should be one of the following: ^GSPC, ^IXIC, ^STOXX50E, ^SSMI',
      };
    }

    const url = `https://za.investing.com/indices/${index.investingUrlName}`;

    const browser = await chromium.launch(options);

    const context = await browser.newContext(contextOptions);

    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const content = await page.content();
    await browser.close();

    const $ = cheerio.load(content);

    // Extract "Top Gainers" data
    const gainersTable = $('[data-test="gainers-table"] tbody tr');
    const gainers = gainersTable
      .map((_, row) => {
        const cells = $(row).find('td');
        return {
          name: $(cells[0])
            .find('[data-test="gainers-losers-label"]')
            .text()
            .trim(),
          symbol: $(cells[0]).find('span.font-semibold').text().trim(),
          price: $(cells[1])
            .find('[data-test="gainers-losers-last"]')
            .text()
            .trim(),
          change: $(cells[1])
            .find('[data-test="gainers-losers-change"] span.font-normal')
            .text()
            .trim(),
          changePercent: $(cells[1])
            .find('[data-test="gainers-losers-change"] span.font-semibold')
            .text()
            .trim(),
        };
      })
      .get();

    // Extract "Top Losers" data
    const losersTable = $('[data-test="losers-table"] tbody tr');
    const losers = losersTable
      .map((_, row) => {
        const cells = $(row).find('td');
        return {
          name: $(cells[0])
            .find('[data-test="gainers-losers-label"]')
            .text()
            .trim(),
          symbol: $(cells[0]).find('span.font-semibold').text().trim(),
          price: $(cells[1])
            .find('[data-test="gainers-losers-last"]')
            .text()
            .trim(),
          change: $(cells[1])
            .find('[data-test="gainers-losers-change"] span.font-normal')
            .text()
            .trim(),
          changePercent: $(cells[1])
            .find('[data-test="gainers-losers-change"] span.font-semibold')
            .text()
            .trim(),
        };
      })
      .get();

    return { gainers, losers };
  }

  @UseInterceptors(CacheInterceptor)
  @ApiExcludeEndpoint()
  @Get('market-movers/:indexSymbol')
  // @Param('symbol') symbol: string,
  async marketMovers(
    @Param('indexSymbol') indexSymbol: string,
  ): Promise<object> {
    // get the index from the indexes array
    const indexEntry = indexes.find(
      (index) => index.yahooFinanceSymbol === indexSymbol.toUpperCase(),
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
    const url =
      'https://superbalist.com/browse/men/shoes/sneakers?max_price=2000&page=3';
    const browser = await chromium.launch(options);
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const content = await page.content();
    await browser.close();

    // save the content to a file
    fs.writeFileSync('sneakers.html', content);

    return { content };
  }

  // route for scra[ping a url
  @UseInterceptors(CacheInterceptor)
  @ApiExcludeEndpoint()
  @Get('test')
  async test(): Promise<object> {
    // simulate waiting for 5 seconds
    await new Promise((resolve) => setTimeout(resolve, 3000));

    return { hello: 'world' };
  }

  // **************************************************************
  // Index related endpoints
  // **************************************************************

  @Get('getIndexQuote/:symbol')
  async getIndexQuote(
    @Param('symbol') symbol: string,
  ): Promise<IndexQuote | { error: string }> {
    // get the quote for the symbol from the database
    const quote = await this.dataSource
      .getRepository(Quote)
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
  async getIndexPerformances(): Promise<IndexPerformance[]> {
    // get all indexes from the database
    const indexes = await this.dataSource
      .getRepository(Index)
      .createQueryBuilder('index')
      .getMany();

    // for each index, get the history from this.performance
    const performancePromises = indexes.map(async (index) => {
      // get the performance for the index
      const params = { symbol: index.symbol };
      const performance = await this.performance(params);

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
  ): Promise<IndexPerformance | { error: string }> {
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

      // return the dashboard object for the index
      return {
        symbol: index.symbol,
        quote: quote,
        performance: performance,
        news: news,
        marketMovers: marketMovers,
      };
    });

    // wait for all promises to resolve
    const dashboardResults = await Promise.all(dashboardPromises);

    // return the dashboard results
    return dashboardResults;
  }

  @UseInterceptors(CacheInterceptor)
  @Get('getSymbolAnalysis/:index/:symbol')
  async getSymbolAnalysisByIndex(
    @Param('index') index: string,
    @Param('symbol') symbol: string,
  ): Promise<object | { error: string }> {
    // ensure the index is in the indexes array
    const indexObj = indexes.find(
      (i) => i.yahooFinanceSymbol === index.toUpperCase(),
    );

    if (!indexObj) {
      return { error: 'Index not found.' };
    }

    // analyze the stock
    try {
      const analysis = await analyzeStock(indexObj.yahooFinanceSymbol, symbol);
      return analysis;
    } catch (error) {
      return { error: error.message };
    }
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

// **************************************************************
// Exposures and Contributions
// **************************************************************

function getReturns(prices: any[]): number[] {
  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    const ret = (prices[i] - prices[i - 1]) / prices[i - 1];
    returns.push(ret);
  }
  return returns;
}

// TODO: fettch history from database

const today = new Date();
const startDate = new Date();
startDate.setFullYear(today.getFullYear() - 1);
startDate.setDate(startDate.getDate() - 60);

async function fetchHistoricalData(symbol: string) {
  const result = await yahooFinance.historical(symbol, {
    period1: startDate,
    period2: today,
    interval: '1d',
  });
  return result
    .map((entry) => ({
      date: entry.date,
      close: entry.adjClose || entry.close,
    }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function getMomentumExposure(ticker: string, historical: any[]) {
  // const today = new Date();
  // const startDate = new Date();
  // startDate.setFullYear(today.getFullYear() - 1);
  // startDate.setDate(startDate.getDate() - 30); // ensure we get 12+ months of data

  // const historical = await yahooFinance.historical(ticker, {
  //   period1: startDate,
  //   period2: today,
  //   interval: "1d",
  // });

  if (historical.length < 252 + 21) {
    throw new Error('Not enough data to calculate momentum exposure.');
  }

  historical.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
  const price_252 = historical[historical.length - 252].close;
  const price_21 = historical[historical.length - 21].close;

  const momentumExposure = (price_21 - price_252) / price_252;

  console.log(
    `Momentum exposure for ${ticker}: ${(momentumExposure * 100).toFixed(2)}%`,
  );
  return momentumExposure;
}

async function analyzeStock(marketIndex: string, ticker: string) {
  const stockData = await fetchHistoricalData(ticker);
  const marketData = await fetchHistoricalData(marketIndex);

  const stockPrices = stockData.map((d) => d.close);
  const marketPrices = marketData.map((d) => d.close);

  const stockReturns = getReturns(stockPrices);
  const marketReturns = getReturns(marketPrices);

  // Align return series
  const minLength = Math.min(stockReturns.length, marketReturns.length);
  const alignedStockReturns = stockReturns.slice(0, minLength);
  const alignedMarketReturns = marketReturns.slice(0, minLength);

  // MARKET: beta via linear regression
  const beta_market =
    ss.linearRegressionLine(
      ss.linearRegression(
        alignedMarketReturns.map((x, i) => [x, alignedStockReturns[i]]),
      ),
    )(1) - ss.linearRegressionLine(ss.linearRegression([[0, 0]]))(1); // Slope only

  const avg_market_return = mean(alignedMarketReturns);
  const contribution_market = beta_market * avg_market_return;

  // MOMENTUM: approx. 12-month return minus 1 month (just rough proxy)
  //const momentum =
  //    (stockPrices[stockPrices.length - 22] - stockPrices[0]) / stockPrices[0];

  // Calculate 12-month momentum minus last month for GOOG in Node.js
  // Assuming you have a DataFrame-like structure (e.g., Danfo.js DataFrame) called goog
  // 252 trading days ≈ 12 months, shift by 21 days (1 month)

  // const adjClose = goog["Adj Close"].values;
  // let momentumX = new Array(adjClose.length).fill(null);
  // for (let i = 0; i < adjClose.length; i++) {
  //   if (i >= 252 + 21) {
  //     momentum[i] =
  //       (adjClose[i - 21] - adjClose[i - 252 - 21]) / adjClose[i - 252 - 21];
  //   }
  // }

  // const momentum = goog
  //   .map((row, i, arr) => {
  //     if (i < 252 + 21) return null;
  //     return (
  //       (row.adjclose - arr[i - 252].adjclose) / arr[i - 252].adjclose -
  //       (row.adjclose - arr[i - 21].adjclose) / arr[i - 21].adjclose
  //     );
  //   })
  //   .filter((x) => x !== null);

  const momentum = getMomentumExposure(ticker, stockData);

  // VOLATILITY: inverse of standard deviation
  const volatility: any = std(alignedStockReturns);
  const vol_factor_exposure = 1 / volatility;
  const avg_vol_factor_return = 1 / std(alignedMarketReturns as any);
  const contribution_volatility = vol_factor_exposure * avg_vol_factor_return;

  // FUNDAMENTALS
  const summary = await yahooFinance.quoteSummary(ticker, {
    modules: [
      'defaultKeyStatistics',
      'financialData',
      'summaryDetail',
      'price',
    ],
  });
  const info = summary.defaultKeyStatistics;

  if (!info) {
    throw new Error(`No financial data found for ${ticker}`);
  }

  const pb = info.priceToBook || 10;
  const roe = summary.financialData?.returnOnEquity || 0.2;
  // Try to get marketCap from summaryDetail, then price, fallback to 1e12
  const marketCap =
    summary.summaryDetail?.marketCap || summary.price?.marketCap || 1e12;

  const value_exposure = 1 / pb;
  const quality_exposure = roe;
  const size_exposure = -Math.log(Number(marketCap) / 1e11);

  const contribution_value = value_exposure * 0.01;
  const contribution_quality = quality_exposure * 0.01;
  const contribution_size = size_exposure * 0.01;
  const contribution_momentum = momentum * 0.01;

  type FactorKey =
    | 'Market'
    | 'Size'
    | 'Value'
    | 'Momentum'
    | 'Quality'
    | 'Volatility';

  const contributions: Record<FactorKey, number> = {
    Market: contribution_market,
    Size: contribution_size,
    Value: contribution_value,
    Momentum: contribution_momentum,
    Quality: contribution_quality,
    Volatility: contribution_volatility,
  };

  const exposures: Record<FactorKey, number> = {
    Market: beta_market,
    Size: size_exposure,
    Value: value_exposure,
    Momentum: momentum,
    Quality: quality_exposure,
    Volatility: vol_factor_exposure,
  };

  const total = Object.values(contributions).reduce(
    (sum, val) => sum + Math.abs(val),
    0,
  );
  const contribution_percent: Record<FactorKey, number> = Object.fromEntries(
    Object.entries(contributions).map(([k, v]) => [
      k,
      (100 * Math.abs(v)) / total,
    ]),
  ) as Record<FactorKey, number>;

  // Display results
  console.table(
    (Object.keys(exposures) as FactorKey[]).map((key) => ({
      Factor: key,
      Exposure: exposures[key], //?.toFixed(4),
      'Contribution (%)': contribution_percent[key], //?.toFixed(2),
    })),
  );

  // Return an object with the analysis results
  return {
    exposures,
    contributions,
    contribution_percent,
    summary,
  };
}
